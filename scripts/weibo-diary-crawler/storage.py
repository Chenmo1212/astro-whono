"""
storage.py —— 持久化存储封装
支持两种存储后端，通过 config.yaml 中 storage.mode 切换：
  - json    : 保存到本地 JSON 文件，无需 MongoDB（适合本地调试）
  - mongodb : 写入 MongoDB，以 weibo_id 为唯一索引做幂等写入（upsert）

对外统一使用 create_storage(cfg) 工厂函数获取存储实例，
两种后端均实现 upsert_post() / upsert_many() / close() 三个接口。
"""

import json
import os
from datetime import datetime

from loguru import logger


# ======================================================================
# JSON 文件存储（无需 MongoDB）
# ======================================================================

class JsonStorage:
    """
    将微博数据以 JSON 文件持久化。
    文件结构：一个 JSON 数组，每个元素为一条微博文档。
    以 weibo_id 为唯一键做幂等写入（与 MongoDB 模式行为一致）。
    """

    def __init__(self, json_path: str):
        self._path = json_path
        os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
        logger.info("JSON 存储初始化，文件路径：{}", json_path)

    def _load(self) -> list[dict]:
        """读取现有 JSON 文件，不存在则返回空列表"""
        if not os.path.isfile(self._path):
            return []
        try:
            with open(self._path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("读取 JSON 文件失败，将以空数据开始：{}", e)
        return []

    def _save(self, posts: list[dict]):
        """将数据写回 JSON 文件（覆盖写）"""
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)

    def upsert_post(self, post: dict) -> bool:
        """
        幂等写入单条微博：
          - 若 weibo_id 已存在 → 更新（$set 等价操作）
          - 若不存在 → 追加
        返回 True 表示新增，False 表示更新已有记录。
        """
        weibo_id = post.get("weibo_id")
        if not weibo_id:
            logger.warning("upsert_post：post 缺少 weibo_id 字段，跳过")
            return False

        posts = self._load()
        for i, existing in enumerate(posts):
            if str(existing.get("weibo_id")) == str(weibo_id):
                posts[i] = post          # 更新
                self._save(posts)
                logger.info("JSON 更新微博 weibo_id={}", weibo_id)
                return False

        posts.append(post)               # 新增
        self._save(posts)
        logger.info("JSON 新增微博 weibo_id={}", weibo_id)
        return True

    def upsert_many(self, posts: list[dict]) -> tuple[int, int]:
        """批量幂等写入，返回 (新增数, 更新数)"""
        new_count = updated_count = 0
        for post in posts:
            if self.upsert_post(post):
                new_count += 1
            else:
                updated_count += 1
        logger.info("JSON 写入完成：新增 {} 条，更新 {} 条", new_count, updated_count)
        return new_count, updated_count

    def close(self):
        """JSON 模式无需关闭连接，保留接口一致性"""
        pass


# ======================================================================
# MongoDB 存储（改写自 weibo.py info_to_mongodb()）
# ======================================================================

class MongoStorage:
    """
    MongoDB 存储器。
    连接字符串优先从环境变量 MONGO_URI 读取，其次使用配置文件中的值。
    以 weibo_id 建唯一索引，使用 update_one upsert=True 幂等写入。
    """

    def __init__(self, cfg: dict):
        from pymongo import MongoClient, ASCENDING
        from pymongo.errors import ServerSelectionTimeoutError

        uri = os.environ.get("MONGO_URI") or cfg.get("uri", "mongodb://localhost:27017")
        db_name = cfg.get("database", "weibo_diary")
        col_name = cfg.get("collection", "posts")

        try:
            self._client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self._client.server_info()  # 触发连接检测
            self._col = self._client[db_name][col_name]
            # 建唯一索引，保证幂等写入
            self._col.create_index([("weibo_id", ASCENDING)], unique=True, background=True)
            logger.info("MongoDB 连接成功：{}/{}:{}", uri, db_name, col_name)
        except ServerSelectionTimeoutError as e:
            logger.error("MongoDB 连接失败，请检查服务是否启动：{}", e)
            raise

    def upsert_post(self, post: dict) -> bool:
        """以 weibo_id 为键幂等写入，返回 True=新增 / False=更新"""
        from pymongo.errors import DuplicateKeyError

        weibo_id = post.get("weibo_id")
        if not weibo_id:
            logger.warning("upsert_post：post 缺少 weibo_id 字段，跳过")
            return False

        try:
            result = self._col.update_one(
                {"weibo_id": weibo_id},
                {"$set": post},
                upsert=True,
            )
            if result.upserted_id:
                logger.info("MongoDB 新增微博 weibo_id={}", weibo_id)
                return True
            else:
                logger.info("MongoDB 更新微博 weibo_id={}", weibo_id)
                return False
        except DuplicateKeyError:
            logger.warning("weibo_id={} 遇唯一键冲突，已忽略", weibo_id)
            return False
        except Exception as e:
            logger.exception("写入 MongoDB 失败，weibo_id={}：{}", weibo_id, e)
            return False

    def upsert_many(self, posts: list[dict]) -> tuple[int, int]:
        """批量幂等写入，返回 (新增数, 更新数)"""
        new_count = updated_count = 0
        for post in posts:
            if self.upsert_post(post):
                new_count += 1
            else:
                updated_count += 1
        logger.info("MongoDB 写入完成：新增 {} 条，更新 {} 条", new_count, updated_count)
        return new_count, updated_count

    def close(self):
        """关闭 MongoDB 连接"""
        try:
            self._client.close()
        except Exception:
            pass


# ======================================================================
# 工厂函数：根据配置选择存储后端
# ======================================================================

def create_storage(cfg: dict):
    """
    根据 config.yaml 中的 storage.mode 创建对应存储实例。

    cfg 应包含整个配置文件的顶层字典，函数自动读取：
      - cfg['storage']['mode']      : 'json' 或 'mongodb'
      - cfg['storage']['json_path'] : JSON 模式下的文件路径
      - cfg['mongodb']              : MongoDB 模式下的连接配置

    缺省 mode 为 'json'（本地调试友好）。
    """
    storage_cfg = cfg.get("storage", {})
    mode = storage_cfg.get("mode", "json").strip().lower()

    if mode == "mongodb":
        mongo_cfg = cfg.get("mongodb", {})
        return MongoStorage(mongo_cfg)
    else:
        # 默认 json 模式
        if mode not in ("json",):
            logger.warning("未知 storage.mode='{}'，回退为 json 模式", mode)
        json_path = storage_cfg.get("json_path", "./data/posts.json")
        return JsonStorage(json_path)
