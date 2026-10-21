"""本地预览服务器（手机访问用）

比 `python -m http.server` 快很多，专为手机访问优化：
  · HTTP/1.1 长连接：多个文件只建一次连接（默认的是 HTTP/1.0，每个文件都要重新握手）
  · 多线程：图片、样式、脚本同时下载，不排队
  · gzip 压缩：css / js / html / svg 体积减少 60%~80%

用法：
    python serve.py            # 默认 8081
    python serve.py 9000       # 指定端口
手机访问：http://电脑IP:8081/
"""

import gzip
import http.server
import io
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
GZIP_EXT = {'.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest', '.md'}
EXTRA_TYPES = {'.webmanifest': 'application/manifest+json', '.js': 'application/javascript; charset=utf-8'}


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'   # 开启长连接，手机加载明显变快

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass   # 安静一点，不在终端刷日志

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        t = super().guess_type(path)
        if ext in ('.js', '.css', '.html', '.json', '.svg', '.webmanifest'):
            return t + '; charset=utf-8'
        return t

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if not os.path.isfile(path):
            return super().send_head()

        ext = os.path.splitext(path)[1].lower()
        with open(path, 'rb') as f:
            data = f.read()

        enc = None
        if ext in GZIP_EXT and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
            data = gzip.compress(data, 9)
            enc = 'gzip'

        is_html = ext in ('.html', '.webmanifest')
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Length', str(len(data)))
        if enc:
            self.send_header('Content-Encoding', enc)
        # html 每次校验（改了就能看到），静态资源缓存 10 分钟
        self.send_header('Cache-Control', 'no-cache' if is_html else 'public, max-age=600')
        self.end_headers()
        return io.BytesIO(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.daemon_threads = True
    print('serving %s on http://0.0.0.0:%d/' % (ROOT, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
