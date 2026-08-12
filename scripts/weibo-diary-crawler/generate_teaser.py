"""
generate_teaser.py —— 为加密文章生成公开主题提示（DeepSeek API 版）

读取 bits markdown 文件，对其中已标记 `encrypted: true` 且尚无 `summary` 字段的条目
调用 DeepSeek API 生成一句含蓄的主题描述，写入 frontmatter 的 `summary` 字段。

也可作为独立脚本使用：

    # 对单个文件生成 teaser（dry-run，仅打印）：
    python generate_teaser.py path/to/bits-2025-06-15-2330.md

    # 生成并写入 summary 字段：
    python generate_teaser.py --apply path/to/bits-2025-06-15-2330.md

    # 批量处理 src/content/bits/ 下所有加密文件（dry-run）：
    python generate_teaser.py --all

    # 批量处理并写入（16 并发，断点续跑）：
    python generate_teaser.py --all --apply --workers 16 --resume results.json

    # 强制重新生成已有 summary（默认跳过）：
    python generate_teaser.py --all --apply --force

在管道中使用时，直接调用 generate_teasers() 即可。

Options
-------
--all            扫描 src/content/bits/ 下所有加密 *.md
--apply          写入 summary 字段（默认 dry-run）
--force          强制重新生成已有 summary 的文件（默认跳过）
--workers N      --all 模式下的并发数（默认 8）
--model MODEL    DeepSeek 模型名称（默认 deepseek-chat）
--timeout N      每次 API 调用超时秒数（默认 60）
--resume FILE    断点续跑：读取上次保存的 JSON，跳过已完成文件
--save FILE      --all 完成后保存结果 JSON（默认 generate_teaser_results.json）
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


def _is_encrypted(raw: str) -> bool:
    m = FM_RE.match(raw)
    if not m:
        return False
    return bool(re.search(r"^encrypted:\s*true\s*$", m.group(1), re.MULTILINE))


def _has_summary(raw: str) -> bool:
    m = FM_RE.match(raw)
    if not m:
        return False
    return bool(re.search(r"^summary:", m.group(1), re.MULTILINE))


def _set_summary(path: str | Path, teaser: str) -> None:
    """在 frontmatter 中添加或更新 `summary: "<teaser>"`。"""
    raw = _read(path)
    m = FM_RE.match(raw)
    if not m:
        logger.warning("generate_teaser: 未找到 frontmatter，跳过写入 {}", path)
        return

    fm_text = m.group(1)
    body_after = raw[m.end():]

    # YAML 单引号转义：单引号 → 两个单引号
    safe = teaser.replace("'", "''")
    summary_line = f"summary: '{safe}'"

    if re.search(r"^summary:", fm_text, re.MULTILINE):
        # 替换已有的 summary 行（可能跨行的引号值），使用简单单行替换
        fm_text = re.sub(
            r"^summary:.*$", summary_line, fm_text, count=1, flags=re.MULTILINE
        )
    elif re.search(r"^encrypted:", fm_text, re.MULTILINE):
        # 插在 encrypted 行之后
        fm_text = re.sub(
            r"^(encrypted:.*)$", r"\1\n" + summary_line, fm_text, count=1, flags=re.MULTILINE
        )
    else:
        fm_text = fm_text.rstrip() + "\n" + summary_line

    new_raw = "---\n" + fm_text + "\n---\n" + body_after
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_raw)


# ── Prompt ───────────────────────────────────────────────────────────────────

_ENCRYPTED_TEASER_PROMPT = textwrap.dedent("""\
# 加密文章主题提示

你将阅读一篇已经被判定为需要加密的私人文章。

请为博客公开页面生成一句简短的主题描述，让读者知道这篇文章大致在写什么，但不能透露其中的私人细节。

## 要求

- 只概括主题，不总结情节。
- 不透露姓名、昵称、具体人物、时间、地点、对话或可识别的事件细节。
- 可以描述文章涉及的关系、情绪、人生阶段或思考。
- 克制、自然、含蓄，不煽情，不故作深沉。
- 通常控制在 15～40 个中文字符。
- 如果无法安全概括，就使用更模糊的表达。

例如：

正文：记录一段关系的开始、矛盾、结束，以及后来对这段关系的反思。

应生成：
"关于一段已经结束的关系，以及后来才慢慢想明白的一些事情。"

而不是：
"记录我和某人从相识到分开的过程。"

请只返回 JSON：
{"teaser": "<主题描述>"}
""")


def _build_user_message(body: str) -> str:
    return f"请为以下私人日记条目生成一句公开主题描述：\n\n---\n{body}\n---"


# ── DeepSeek API caller ──────────────────────────────────────────────────────

def _call_deepseek(body: str, model: str, api_key: str, timeout: int) -> str:
    """
    通过 DeepSeek API 生成 teaser。

    Returns:
        str: teaser 文本
    Raises:
        RuntimeError on API error or unexpected response format.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("缺少 openai 包。请运行：pip install openai")

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
        timeout=timeout,
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _ENCRYPTED_TEASER_PROMPT},
                {"role": "user", "content": _build_user_message(body)},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
    except Exception as e:
        raise RuntimeError(f"DeepSeek API 调用失败：{e}")

    raw_content = response.choices[0].message.content or ""

    json_match = re.search(r'\{[^{}]*"teaser"[^{}]*\}', raw_content, re.DOTALL)
    if not json_match:
        raise RuntimeError(f"API 响应中未找到 JSON：{raw_content[:500]}")

    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败：{e}\n原始内容：{json_match.group()[:300]}")

    teaser = data.get("teaser", "").strip()
    if not teaser:
        raise RuntimeError(f"响应 JSON 中 'teaser' 为空：{data}")

    return teaser


# ── Single-file processor ─────────────────────────────────────────────────────

def _process_one(
    path: str,
    model: str,
    api_key: str,
    timeout: int,
    apply: bool,
    force: bool,
) -> dict:
    """处理单个文件，返回结果 dict。内部使用，供并发调用。"""
    result = {
        "path": path,
        "teaser": "",
        "skipped": False,
        "skip_reason": "",
        "applied": False,
        "error": None,
    }

    try:
        raw = _read(path)
    except OSError as e:
        result["error"] = f"读取文件失败：{e}"
        return result

    if not _is_encrypted(raw):
        result["skipped"] = True
        result["skip_reason"] = "未标记 encrypted: true，跳过"
        logger.debug("generate_teaser: 跳过（非加密文件）{}", os.path.basename(path))
        return result

    if _has_summary(raw) and not force:
        result["skipped"] = True
        result["skip_reason"] = "已有 summary，跳过（使用 --force 强制重新生成）"
        logger.debug("generate_teaser: 跳过（已有 summary）{}", os.path.basename(path))
        return result

    m = FM_RE.match(raw)
    body = raw[m.end():].strip() if m else raw.strip()

    if not body:
        result["skipped"] = True
        result["skip_reason"] = "正文为空，跳过"
        return result

    try:
        teaser = _call_deepseek(body, model, api_key, timeout)
    except RuntimeError as e:
        result["error"] = str(e)
        logger.warning("generate_teaser: API 错误 {} — {}", os.path.basename(path), e)
        return result

    result["teaser"] = teaser

    if apply:
        _set_summary(path, teaser)
        result["applied"] = True
        logger.info(
            "generate_teaser: ✍  已写入 summary  {}  →  {}",
            os.path.basename(path), teaser,
        )
    else:
        logger.info(
            "generate_teaser: 💬 生成（dry-run）  {}  →  {}",
            os.path.basename(path), teaser,
        )

    return result


# ── Public API ────────────────────────────────────────────────────────────────

def generate_teasers(
    file_paths: list[str | Path],
    api_key: str,
    model: str = "deepseek-chat",
    timeout: int = 60,
    apply: bool = True,
    force: bool = False,
    workers: int = 8,
) -> list[dict]:
    """
    对一组 bits markdown 文件并发生成加密 teaser。

    只处理已标记 `encrypted: true` 且尚无 `summary` 的文件（除非 force=True）。

    Args:
        file_paths: bits markdown 文件路径列表。
        api_key:    DeepSeek API 密钥。
        model:      DeepSeek 模型名称（默认 deepseek-chat）。
        timeout:    每次 API 调用超时秒数（默认 60）。
        apply:      True 则写入 summary 字段，False 为 dry-run。
        force:      True 则对已有 summary 的文件强制重新生成。
        workers:    并发线程数（默认 8）。

    Returns:
        每个文件的处理结果列表，每项包含：
        { path, teaser, skipped, skip_reason, applied, error }
    """
    paths = [str(p) for p in file_paths]
    results: list[dict] = []

    if not paths:
        return results

    if len(paths) == 1:
        return [_process_one(paths[0], model, api_key, timeout, apply, force)]

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_process_one, p, model, api_key, timeout, apply, force): p
            for p in paths
        }
        for future in as_completed(futures):
            results.append(future.result())

    order = {p: i for i, p in enumerate(paths)}
    results.sort(key=lambda r: order.get(r["path"], 0))
    return results


# ── Reporting helpers ─────────────────────────────────────────────────────────

def _print_summary(results: list[dict], apply: bool) -> None:
    generated = [r for r in results if r["teaser"] and not r["skipped"] and not r["error"]]
    skipped   = [r for r in results if r["skipped"]]
    errors    = [r for r in results if r["error"]]

    print("\n" + "=" * 70)
    print("汇总报告")
    print("=" * 70)
    print(f"  总计处理: {len(results)} 篇")
    print(f"  ✍  已生成: {len(generated)} 篇")
    print(f"  ⏭  已跳过: {len(skipped)} 篇")
    print(f"  ❌ 出错:   {len(errors)} 篇")

    if generated:
        print("\n── 生成的 teaser ───────────────────────────────────────────────────")
        for r in generated:
            status = "✓ 已写入" if r["applied"] else "dry-run，未写入"
            print(f"  [{status}]  {os.path.basename(r['path'])}")
            print(f"            {r['teaser']}")

    if errors:
        print("\n── 出错的条目 ───────────────────────────────────────────────────────")
        for r in errors:
            print(f"  {os.path.basename(r['path'])}: {r['error']}")

    print("=" * 70)


# ── CLI entry-point ──────────────────────────────────────────────────────────

_BITS_DIR = Path(__file__).parent.parent.parent / "src" / "content" / "bits"

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="DeepSeek teaser 生成器 — 为加密 bits markdown 生成公开主题描述",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "files", nargs="*",
        help="一个或多个 bits markdown 文件路径（与 --all 二选一）",
    )
    parser.add_argument(
        "--all", action="store_true",
        help=f"扫描 src/content/bits/ 下所有加密 *.md（默认路径：{_BITS_DIR}）",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="写入 summary 字段（默认 dry-run）",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="强制重新生成已有 summary 的文件（默认跳过）",
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
        "--save", default="generate_teaser_results.json",
        help="--all 完成后保存结果 JSON 的路径（默认 generate_teaser_results.json）",
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
        _results = generate_teasers(
            file_paths=cli_args.files,
            api_key=_api_key,
            model=cli_args.model,
            timeout=cli_args.timeout,
            apply=cli_args.apply,
            force=cli_args.force,
            workers=cli_args.workers,
        )
        for r in _results:
            short = os.path.basename(r["path"])
            if r["error"]:
                print(f"❌ {short}: {r['error']}")
            elif r["skipped"]:
                print(f"⏭  {short}: {r['skip_reason']}")
            elif r["teaser"]:
                status = "✓ 已写入 summary" if r["applied"] else "dry-run，未写入"
                print(f"✍  {short}: {r['teaser']}  [{status}]")
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
        r = _process_one(
            path, cli_args.model, _api_key, cli_args.timeout,
            cli_args.apply, cli_args.force,
        )
        with print_lock:
            counter["done"] += 1
            n = counter["done"]
            short = os.path.basename(path)
            if r["error"]:
                status = "❌ 出错"
            elif r["skipped"]:
                status = f"⏭  跳过  ({r['skip_reason']})"
            elif r["teaser"]:
                status = f"✍  生成{'  ✓ 已写入' if r['applied'] else ''}  →  {r['teaser']}"
            else:
                status = "—"
            print(f"[{n:3d}/{total}] {short}  {status}", flush=True)
        return r

    try:
        with ThreadPoolExecutor(max_workers=cli_args.workers) as executor:
            futures = {executor.submit(_run_one, p): p for p in todo}
            for future in as_completed(futures):
                all_results.append(future.result())
    except KeyboardInterrupt:
        print("\n[中断] 保存已完成结果...", file=sys.stderr)

    save_path = os.path.abspath(cli_args.save)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到: {save_path}")

    _print_summary(all_results, cli_args.apply)
    sys.exit(0)
