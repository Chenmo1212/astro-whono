import requests
import sys
import json
from datetime import datetime, timezone, timedelta


def post_wx():
    try:
        get_token_url = f"https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={CORPID}&corpsecret={CORPSECRET}"
        response = requests.get(get_token_url).content
        access_token = json.loads(response).get('access_token')

        if access_token and len(access_token) > 0:
            send_msg_url = f'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={access_token}'
            data = {
                "touser": '@all',
                "agentid": AGENTID,
                "msgtype": "textcard",
                "textcard": {
                    "title": repository.split('/')[1] + " updated! 🚀",
                    "description": "🎉 Github Workflow Notification. 🍏 This job's status is " + status,
                    "url": "https://github.com/" + repository,
                    "btntxt": "More"
                },
                "enable_id_trans": 0,
                "enable_duplicate_check": 0,
                "duplicate_check_interval": 1800
            }
            requests.post(send_msg_url, data=json.dumps(data))
        else:
            print('error: Failed to post wechat notification. access_token is invalid. status: 500')
    except Exception as e:
        print('error: Failed to post wechat notification.' + str(e) + ' status: 500')


def notify_weibo_sync(api_url: str, job_status: str, repository: str,
                      run_id: str, server_url: str, summary_path: str) -> None:
    """
    发送 Weibo Sync 通知到自定义消息 API，包含同步摘要详情。

    Args:
        api_url:      消息 API 端点（如 https://api.chenmo1212.cn/message/entries）
        job_status:   GitHub Actions job.status（success / failure / cancelled）
        repository:   github.repository（如 owner/repo）
        run_id:       github.run_id
        server_url:   github.server_url（如 https://github.com）
        summary_path: pipeline 写出的 pipeline_summary.json 路径
    """
    icon = "✅" if job_status == "success" else "❌"

    # ── 读取管道摘要 ──────────────────────────────────────────────────────────
    summary: dict = {}
    try:
        with open(summary_path, encoding="utf-8") as f:
            summary = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[notify] 读取摘要文件失败（{e}），将发送基础通知")

    total: int        = summary.get("total", 0)
    total_images: int = summary.get("total_images", 0)
    encrypted: int    = summary.get("encrypted", 0)
    img_errors: int   = summary.get("img_errors", 0)
    posts: list       = summary.get("posts", [])

    # ── Build per-post summary lines ─────────────────────────────────────────
    lines: list[str] = []
    for p in posts:
        created = p.get("created_at", "")
        try:
            dt = datetime.fromisoformat(created)
            ts = dt.strftime("%m-%d %H:%M")
        except (ValueError, TypeError):
            ts = created[:16] if created else "?"

        n_img   = p.get("image_count", 0)
        n_err   = p.get("img_errors", 0)
        enc_tag = " 🔒" if p.get("encrypted") else ""
        img_tag = f" [{n_img} img" + (f", {n_err} failed" if n_err else "") + "]" if n_img else " [no image]"
        lines.append(f"  • {ts}{enc_tag}{img_tag}")

    # ── Assemble content string ───────────────────────────────────────────────
    bj_now = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    details_url = f"{server_url}/{repository}/actions/runs/{run_id}"

    crawl_failed: bool = summary.get("crawl_failed", False)

    if crawl_failed:
        sync_summary = "⚠️ Crawl failed — Cookie may have expired or network error"
    elif total == 0:
        sync_summary = "No new posts today"
    else:
        sync_summary = (
            f"{total} post(s) synced"
            + (f", {encrypted} encrypted" if encrypted else "")
            + (f", {total_images} image(s)" if total_images else "")
            + (f", {img_errors} upload failure(s)" if img_errors else "")
        )

    post_lines = "\n".join(lines) if lines else "  (no details)"
    content = (
        f"Repo: {repository}\n"
        f"Time: {bj_now} (CST)\n"
        f"Summary: {sync_summary}\n"
        f"{post_lines}\n"
        f"Details: {details_url}"
    )

    payload = {
        "type": "notification",
        "metadata": {
            "title": f"{icon} Weibo Sync {job_status}",
            "content": content,
            "priority": "high",
            "target_user": "admin",
        },
    }

    try:
        resp = requests.post(api_url, json=payload, timeout=15)
        print(f"[notify] 通知已发送，状态码：{resp.status_code}")
    except Exception as e:
        print(f"[notify] 发送通知失败：{e}")


if __name__ == '__main__':
    # ── --notify-weibo 模式 ──────────────────────────────────────────────────
    if len(sys.argv) > 1 and sys.argv[1] == '--notify-weibo':
        # 用法：python wechat.py --notify-weibo <api_url> <status> <repo> <run_id> <server_url> <summary_path>
        if len(sys.argv) < 8:
            print('Usage: python wechat.py --notify-weibo <api_url> <status> <repo> <run_id> <server_url> <summary_path>')
            sys.exit(1)
        notify_weibo_sync(
            api_url=sys.argv[2],
            job_status=sys.argv[3],
            repository=sys.argv[4],
            run_id=sys.argv[5],
            server_url=sys.argv[6],
            summary_path=sys.argv[7],
        )
    else:
        # ── 原有 WeChat 企业号通知模式 ──────────────────────────────────────
        try:
            repository = sys.argv[1]
            status = sys.argv[2]
            AGENTID = sys.argv[3]  # application id
            CORPID = sys.argv[4]  # enterprise id
            CORPSECRET = sys.argv[5]  # application secret
            post_wx()
        except IndexError:
            print('Please specify five params: repository, job_status, AGENTID, CORPID, CORPSECRET')
