"""
check_privacy.py —— 隐私敏感性检查器（DeepSeek API 版）

读取 bits markdown 文件，调用 DeepSeek API 判断每篇日记是否可能让
熟人识别出其中提及的人，若敏感则在 frontmatter 中写入 `encrypted: true`。

也可作为独立脚本使用：

    # 检查单个文件（dry-run）：
    python check_privacy.py path/to/bits-2025-06-15-2330.md

    # 检查单个文件并写入 encrypted: true：
    python check_privacy.py --apply path/to/bits-2025-06-15-2330.md

    # 批量扫描 src/content/bits/（dry-run，8 个并发）：
    python check_privacy.py --all

    # 批量扫描并写入（16 并发，断点续跑）：
    python check_privacy.py --all --apply --workers 16 --resume results.json

在管道中使用时，直接调用 check_and_apply_privacy() 即可。

Options
-------
--all            扫描 src/content/bits/ 下所有 *.md
--apply          若敏感则写入 encrypted: true（默认 dry-run）
--workers N      --all 模式下的并发数（默认 8）
--model MODEL    DeepSeek 模型名称（默认 deepseek-chat）
--timeout N      每次 API 调用超时秒数（默认 60）
--resume FILE    断点续跑：读取上次保存的 JSON，跳过已完成文件
--save FILE      --all 完成后保存结果 JSON（默认 check_privacy_results.json）
"""

import glob as _glob
import json
import os
import re
import sys
import textwrap
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# 自动加载同目录下的 .env 文件
load_dotenv(Path(__file__).parent / ".env")

# ── Frontmatter helpers ──────────────────────────────────────────────────────

FM_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)


def _read(path: str | Path) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def _already_encrypted(raw: str) -> bool:
    m = FM_RE.match(raw)
    if not m:
        return False
    return bool(re.search(r"^encrypted:\s*true\s*$", m.group(1), re.MULTILINE))


def _set_encrypted_true(path: str | Path) -> None:
    """在 frontmatter 中添加或更新 `encrypted: true`。"""
    raw = _read(path)
    m = FM_RE.match(raw)
    if not m:
        logger.warning("check_privacy: 未找到 frontmatter，跳过写入 {}", path)
        return

    fm_text = m.group(1)
    body_after = raw[m.end():]

    if re.search(r"^encrypted:", fm_text, re.MULTILINE):
        fm_text = re.sub(r"^encrypted:.*$", "encrypted: true", fm_text, flags=re.MULTILINE)
    elif re.search(r"^draft:", fm_text, re.MULTILINE):
        fm_text = re.sub(
            r"^(draft:.*)$", r"\1\nencrypted: true", fm_text, count=1, flags=re.MULTILINE
        )
    else:
        fm_text = fm_text.rstrip() + "\nencrypted: true"

    new_raw = "---\n" + fm_text + "\n---\n" + body_after
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_raw)


# ── Prompt ───────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""\
# 日记隐私审核

## 任务目标
保护日记中可识别的现实人物（尤其是亲密关系人）的隐私与情感舒适度，避免因细节暴露引发当事人不适。允许记录泛化的个人经历与感悟。

## 硬性红线（立即加密）
凡正文中出现特定亲密关系代称（如“景儿”“元宝”），**无论内容、时间、态度如何**，直接判定为加密。此规则优先级最高，不接受任何例外。

## 核心判断标准
**“倘若当事人（或熟悉内情的第三方）看到这篇日记，是否会感到难堪、被冒犯或隐私暴露？”** 如是，则加密。

## 判断流程（由硬到软）

### 第一步：检查硬性关键词
若出现“景儿”“元宝”等指定代称 → **加密**（结束）。

### 第二步：识别人物关系层级
- **亲密关系人**：恋人、暗恋对象、至交（如日记中频繁出现的特定名字）。→ 从严审查，细节敏感度阈值低。
- **普通社会角色**：房东、同事、经理、室友、教练等。→ 可相对放宽，但若细节极度具体仍可能加密。

### 第三步：评估内容细节的暴露程度
- **高风险细节（加密）**：具体肢体接触（牵手、拥抱、依偎）、私密对话内容、情绪脆弱时刻（“不安”“迷茫”）、对对方心理的深入揣测、特定时间地点的可还原场景。
- **低风险细节（不加密）**：仅提及共同活动（吃饭、散步）、泛化赞美或吐槽、无具体对话和场景还原的笼统描述。

### 第四步：时间修正（仅对普通社会角色有效）
若事件发生距今超过1年，且人物非亲密关系人，细节模糊，则可降级为不加密。**该修正不适用于硬性关键词和亲密关系人**。

## 倾向性示例
| 情况 | 判定 |
| :--- | :--- |
| 日记写“景儿今天主动牵了我的手，我有点不知所措” | **加密**（硬关键词+肢体细节） |
| 日记写“元宝来家里吃饭，做了水煮肉片” | **加密**（硬关键词，即使内容日常） |
| 日记写“室友昨晚喝醉了，在客厅大哭” | **不加密**（模糊角色，无具体指向） |
| 日记写“同事A在会议上用难听的话骂我” | **加密**（若同事身份可推断，且细节具体） |
| 日记写“几年前和朋友闹过矛盾，现在释怀了” | **不加密**（时间久+模糊角色+无细节） |

## 执行原则
**宁严勿松**：凡对亲密关系人的内容存疑，或细节可能让当事人不适，优先选择加密。日常琐事、公共事件、泛化感悟则可通过。

请返回 JSON：
{"sensitive": true|false, "reason": "<具体判断依据，即使 false 也要填写>"}
""")


def _build_user_message(body: str) -> str:
    return f"请审阅以下日记条目，判断其是否涉及隐私敏感内容：\n\n---\n{body}\n---"


# ── DeepSeek API caller ──────────────────────────────────────────────────────

def _call_deepseek(body: str, model: str, api_key: str, timeout: int) -> dict:
    """
    通过 DeepSeek API（兼容 OpenAI SDK）检查隐私敏感性。

    Returns:
        {"sensitive": bool, "reason": str}
    Raises:
        RuntimeError on API error or unexpected response format.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError(
            "缺少 openai 包。请运行：pip install openai"
        )

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
        timeout=timeout,
    )

    user_msg = _build_user_message(body)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
    except Exception as e:
        raise RuntimeError(f"DeepSeek API 调用失败：{e}")

    raw_content = response.choices[0].message.content or ""

    # Extract JSON — the response_format=json_object guarantee should make this
    # straightforward, but we parse defensively in case there is extra wrapping.
    json_match = re.search(r'\{[^{}]*"sensitive"[^{}]*\}', raw_content, re.DOTALL)
    if not json_match:
        raise RuntimeError(f"API 响应中未找到 JSON：{raw_content[:500]}")

    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败：{e}\n原始内容：{json_match.group()[:300]}")

    if "sensitive" not in data:
        raise RuntimeError(f"响应 JSON 缺少 'sensitive' 键：{data}")

    return {
        "sensitive": bool(data["sensitive"]),
        "reason": data.get("reason", ""),
    }


# ── Single-file processor ─────────────────────────────────────────────────────

def _process_one(path: str, model: str, api_key: str, timeout: int, apply: bool) -> dict:
    """处理单个文件，返回结果 dict。内部使用，供并发调用。"""
    result = {
        "path": path,
        "sensitive": False,
        "reason": "",
        "skipped": False,
        "applied": False,
        "error": None,
    }

    try:
        raw = _read(path)
    except OSError as e:
        result["error"] = f"读取文件失败：{e}"
        return result

    if _already_encrypted(raw):
        result["skipped"] = True
        result["reason"] = "已标记 encrypted: true，跳过"
        logger.debug("check_privacy: 跳过（已加密）{}", os.path.basename(path))
        return result

    m = FM_RE.match(raw)
    body = raw[m.end():].strip() if m else raw.strip()

    if not body:
        result["skipped"] = True
        result["reason"] = "正文为空，跳过"
        return result

    try:
        verdict = _call_deepseek(body, model, api_key, timeout)
    except RuntimeError as e:
        result["error"] = str(e)
        logger.warning("check_privacy: API 错误 {} — {}", os.path.basename(path), e)
        return result

    result["sensitive"] = verdict["sensitive"]
    result["reason"] = verdict["reason"]

    if verdict["sensitive"]:
        if apply:
            _set_encrypted_true(path)
            result["applied"] = True
            logger.info("check_privacy: 🔒 敏感 → 已写入 encrypted: true  {}", os.path.basename(path))
        else:
            logger.info("check_privacy: 🔒 敏感（dry-run，未写入）  {}", os.path.basename(path))
    else:
        logger.debug("check_privacy: ✅ 无隐私问题  {}", os.path.basename(path))

    return result


# ── Public API ───────────────────────────────────────────────────────────────

def check_and_apply_privacy(
    file_paths: list[str | Path],
    api_key: str,
    model: str = "deepseek-chat",
    timeout: int = 60,
    apply: bool = True,
    workers: int = 8,
) -> list[dict]:
    """
    对一组 bits markdown 文件并发执行隐私检查。

    Args:
        file_paths: bits markdown 文件路径列表。
        api_key:    DeepSeek API 密钥。
        model:      DeepSeek 模型名称（默认 deepseek-chat）。
        timeout:    每次 API 调用超时秒数（默认 60）。
        apply:      True 则对敏感文件写入 encrypted: true，False 为 dry-run。
        workers:    并发线程数（默认 8）。

    Returns:
        每个文件的处理结果列表，每项包含：
        { path, sensitive, reason, skipped, applied, error }
    """
    paths = [str(p) for p in file_paths]
    results: list[dict] = []

    if not paths:
        return results

    # 单文件直接运行，无需线程池开销
    if len(paths) == 1:
        return [_process_one(paths[0], model, api_key, timeout, apply)]

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_process_one, p, model, api_key, timeout, apply): p
            for p in paths
        }
        for future in as_completed(futures):
            results.append(future.result())

    # 按原始顺序排列结果，方便对照
    order = {p: i for i, p in enumerate(paths)}
    results.sort(key=lambda r: order.get(r["path"], 0))
    return results


# ── Reporting helpers ─────────────────────────────────────────────────────────

def _print_summary(results: list[dict], apply: bool) -> None:
    sensitive = [r for r in results if r["sensitive"] and not r["skipped"] and not r["error"]]
    skipped   = [r for r in results if r["skipped"]]
    errors    = [r for r in results if r["error"]]
    clean     = [r for r in results if not r["sensitive"] and not r["skipped"] and not r["error"]]

    print("\n" + "=" * 70)
    print("汇总报告")
    print("=" * 70)
    print(f"  总计处理: {len(results)} 篇")
    print(f"  ✅ 无问题:  {len(clean)} 篇")
    print(f"  🔒 需加密:  {len(sensitive)} 篇")
    print(f"  ⏭  已跳过:  {len(skipped)} 篇")
    print(f"  ❌ 出错:    {len(errors)} 篇")

    if sensitive:
        print("\n── 需要加密的条目 ──────────────────────────────────────────────────")
        for r in sensitive:
            status = "✓ 已写入" if r["applied"] else ("→ 未写入（dry-run）" if not apply else "✗ 写入失败")
            print(f"  {status}  {os.path.basename(r['path'])}")
            print(f"            {r['reason']}")

    if errors:
        print("\n── 出错的条目 ───────────────────────────────────────────────────────")
        for r in errors:
            print(f"  {os.path.basename(r['path'])}: {r['error']}")

    print("=" * 70)


# ── CLI entry-point ──────────────────────────────────────────────────────────

# 默认 bits 目录（相对于项目根，即本文件上两级）
_BITS_DIR = Path(__file__).parent.parent.parent / "src" / "content" / "bits"

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="DeepSeek 隐私检查器 — 对 bits markdown 文件判断是否需要加密",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "files", nargs="*",
        help="一个或多个 bits markdown 文件路径（与 --all 二选一）",
    )
    parser.add_argument(
        "--all", action="store_true",
        help=f"扫描 src/content/bits/ 下所有 *.md（默认路径：{_BITS_DIR}）",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="若敏感则写入 encrypted: true（默认 dry-run）",
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="--all 模式下的并发线程数（默认 8）",
    )
    parser.add_argument(
        "--model", default="deepseek-chat",
        help="DeepSeek 模型名称（默认 deepseek-chat）",
    )
    parser.add_argument(
        "--timeout", type=int, default=60,
        help="每次 API 调用超时秒数（默认 60）",
    )
    parser.add_argument(
        "--resume", default=None,
        help="断点续跑：读取上次保存的结果 JSON，跳过已完成文件",
    )
    parser.add_argument(
        "--save", default="check_privacy_results.json",
        help="--all 完成后保存结果 JSON 的路径（默认 check_privacy_results.json）",
    )
    cli_args = parser.parse_args()

    if not cli_args.files and not cli_args.all:
        parser.print_help()
        sys.exit(1)

    if cli_args.files and cli_args.all:
        print("Error: 请指定文件路径 或 --all，不能同时使用", file=sys.stderr)
        sys.exit(1)

    _api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not _api_key:
        print("Error: 请设置环境变量 DEEPSEEK_API_KEY", file=sys.stderr)
        sys.exit(1)

    # ── 单文件 / 指定文件列表模式 ──
    if cli_args.files:
        _results = check_and_apply_privacy(
            file_paths=cli_args.files,
            api_key=_api_key,
            model=cli_args.model,
            timeout=cli_args.timeout,
            apply=cli_args.apply,
            workers=cli_args.workers,
        )
        for r in _results:
            short = os.path.basename(r["path"])
            if r["error"]:
                print(f"❌ {short}: {r['error']}")
            elif r["skipped"]:
                print(f"⏭  {short}: {r['reason']}")
            elif r["sensitive"]:
                status = "✓ 已写入 encrypted: true" if r["applied"] else "dry-run，未写入"
                print(f"🔒 {short}: {r['reason']}  [{status}]")
            else:
                print(f"✅ {short}: 无隐私问题")
        sys.exit(0)

    # ── --all 模式：批量扫描 src/content/bits/ ──
    bits_dir = _BITS_DIR.resolve()
    if not bits_dir.is_dir():
        print(f"Error: bits 目录不存在：{bits_dir}", file=sys.stderr)
        sys.exit(1)

    md_files = sorted(_glob.glob(str(bits_dir / "*.md")))
    if not md_files:
        print(f"未找到任何 .md 文件：{bits_dir}", file=sys.stderr)
        sys.exit(1)

    # 断点续跑
    done_paths: set[str] = set()
    previous_results: list[dict] = []
    if cli_args.resume and os.path.isfile(cli_args.resume):
        with open(cli_args.resume, encoding="utf-8") as f:
            previous_results = json.load(f)
        done_paths = {r["path"] for r in previous_results}
        print(f"[resume] 读取已有结果 {len(done_paths)} 条，跳过已完成文件")

    todo = [p for p in md_files if os.path.abspath(p) not in done_paths]

    print(f"扫描目录: {bits_dir}")
    print(f"共 {len(md_files)} 个文件，待处理 {len(todo)} 个 | 并发: {cli_args.workers} | 模式: {'写入' if cli_args.apply else 'dry-run'}")
    print("─" * 70)

    all_results: list[dict] = list(previous_results)
    print_lock = threading.Lock()
    counter = {"done": len(done_paths)}
    total = len(md_files)

    def _run_one(path: str) -> dict:
        r = _process_one(path, cli_args.model, _api_key, cli_args.timeout, cli_args.apply)
        with print_lock:
            counter["done"] += 1
            n = counter["done"]
            short = os.path.basename(path)
            if r["error"]:
                status = "❌ 出错"
            elif r["skipped"]:
                status = "⏭  跳过"
            elif r["sensitive"]:
                status = f"🔒 敏感{'  ✓ 已写入' if r['applied'] else ''}"
            else:
                status = "✅ 无问题"
            print(f"[{n:3d}/{total}] {short}  {status}", flush=True)
        return r

    try:
        with ThreadPoolExecutor(max_workers=cli_args.workers) as executor:
            futures = {executor.submit(_run_one, p): p for p in todo}
            for future in as_completed(futures):
                all_results.append(future.result())
    except KeyboardInterrupt:
        print("\n[中断] 保存已完成结果...", file=sys.stderr)

    # 保存结果 JSON
    save_path = os.path.abspath(cli_args.save)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到: {save_path}")

    _print_summary(all_results, cli_args.apply)
    sys.exit(0)
