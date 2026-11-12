"""Exercise the actual production .htaccess and PHP bridge on local Apache/TLS.
No production writes, fake router, database, or external requests. Requires local
Apache 2.4, PHP CGI, OpenSSL. Run after building, from frontend.
"""
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import unittest
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.h1 = 0; self.styles = 0; self.links = []; self.meta = []; self.scripts = []; self.in_schema = False; self.schema = ''; self.text = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h1': self.h1 += 1
        if tag == 'style': self.styles += 1
        if tag == 'a': self.links.append(attrs.get('href', ''))
        if tag == 'meta': self.meta.append(attrs)
        if tag == 'script':
            self.scripts.append(attrs); self.in_schema = attrs.get('type') == 'application/ld+json'
    def handle_endtag(self, tag):
        if tag == 'script': self.in_schema = False
    def handle_data(self, value):
        if self.in_schema: self.schema += value
        else: self.text.append(value.strip())


class AgentHostingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (DIST / 'agent-manifest.json').is_file(): raise RuntimeError('Build the frontend first.')
        cls.temp = tempfile.TemporaryDirectory(prefix='bonefree-agent-host-')
        cls.work = Path(cls.temp.name); cls.port = free_port(); cls.php_port = free_port()
        # macOS system Apache cannot read Desktop under TCC. Use a byte-for-byte
        # disposable build copy instead of changing filesystem permissions.
        cls.document_root = cls.work / 'site'
        shutil.copytree(DIST, cls.document_root)
        cls.processes = []
        apache = os.environ.get('APACHE_BIN', '/usr/sbin/httpd')
        php = os.environ.get('PHP_CGI_BIN') or shutil.which('php-cgi') or '/usr/local/opt/php/bin/php-cgi'
        modules = Path(os.environ.get('APACHE_MODULES', '/usr/libexec/apache2'))
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=bonefree.pt', '-keyout', str(cls.work/'key.pem'), '-out', str(cls.work/'cert.pem')], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        module_names = ['mpm_prefork', 'unixd', 'authz_core', 'authz_host', 'mime', 'dir', 'headers', 'rewrite', 'log_config', 'ssl', 'proxy', 'proxy_fcgi']
        config = '\n'.join(f'LoadModule {name}_module "{modules}/mod_{name}.so"' for name in module_names)
        config += f'''
ServerRoot "{cls.work}"
DefaultRuntimeDir "{cls.work}"
Mutex file:{cls.work} default
PidFile "{cls.work}/httpd.pid"
Listen 127.0.0.1:{cls.port}
ServerName bonefree.pt
ErrorLog "{cls.work}/error.log"
LogLevel warn
DocumentRoot "{cls.document_root}"
TypesConfig /etc/apache2/mime.types
StartServers 1
MinSpareServers 1
MaxSpareServers 2
MaxRequestWorkers 4
SSLEngine on
SSLCertificateFile "{cls.work}/cert.pem"
SSLCertificateKeyFile "{cls.work}/key.pem"
SSLSessionCache none
ProxyFCGIBackendType GENERIC
<Directory "{cls.document_root}">
  AllowOverride All
  Require all granted
</Directory>
<FilesMatch "\\.php$">
  SetHandler "proxy:fcgi://127.0.0.1:{cls.php_port}"
</FilesMatch>
'''
        (cls.work/'httpd.conf').write_text(config)
        cls.log = (cls.work/'process.log').open('w')
        try:
            cls.processes.append(subprocess.Popen([php, '-b', f'127.0.0.1:{cls.php_port}'], stdout=cls.log, stderr=cls.log))
            cls.processes.append(subprocess.Popen([apache, '-X', '-f', str(cls.work/'httpd.conf')], stdout=cls.log, stderr=cls.log))
            for _ in range(100):
                try:
                    status, _, _ = cls.request('/robots.txt')
                    if status == 200:
                        php_status, _, php_body = cls.request('/mcp')
                        if php_status == 405: break
                except (OSError, http.client.HTTPException): pass
                time.sleep(.1)
            else: raise RuntimeError((cls.work/'process.log').read_text() + (cls.work/'error.log').read_text()[-5000:] + str(locals().get('php_body', '')))
            print(f'Isolated Apache/PHP verification: {cls.work}')
        except BaseException:
            cls.tearDownClass(); raise

    @classmethod
    def tearDownClass(cls):
        for proc in reversed(cls.processes):
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
        cls.log.close()
        cls.temp.cleanup()

    @classmethod
    def request(cls, path, method='GET', headers=None, body=None):
        conn = http.client.HTTPSConnection('127.0.0.1', cls.port, context=ssl._create_unverified_context(), timeout=15)
        conn.request(method, path, body=body, headers={'Host': 'bonefree.pt', **(headers or {})})
        response = conn.getresponse(); data = response.read().decode(); status = response.status
        result_headers = {}
        for key, value in response.getheaders(): result_headers[key.lower()] = result_headers.get(key.lower(), '') + value
        conn.close(); return status, result_headers, data

    def rpc(self, method, params=None, **kwargs):
        body = {'jsonrpc': '2.0', 'id': 1, 'method': method, **({'params': params} if params is not None else {})}
        return self.request('/mcp', 'POST', {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', **kwargs}, json.dumps(body))

    def test_01_public_html_is_readable_and_identifiable_without_js(self):
        manifest = json.loads((DIST/'agent-manifest.json').read_text())
        for path in manifest['pages']:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                parser = PageParser(); parser.feed(body)
                self.assertEqual(parser.h1, 1)
                self.assertEqual(parser.styles, 0, 'Generated styles must be external CSS')
                self.assertGreater(len(' '.join(parser.text)), 300)
                self.assertIn('name="description"', body)
                self.assertIn(f'rel="canonical" href="https://bonefree.pt{path}"', body)
                self.assertIn('Accept', headers.get('vary', ''))
        status, headers, body = self.request('/')
        parser = PageParser(); parser.feed(body)
        self.assertIn('/about', parser.links); self.assertIn('/contact', parser.links); self.assertIn('/privacy', parser.links)
        self.assertIn('tel:+351968107702', parser.links); self.assertIn('mailto:carambolarubra@gmail.com', parser.links)
        graph = json.loads(parser.schema)['@graph']
        self.assertIn('LocalBusiness', graph[0]['@type'])
        self.assertEqual(graph[0]['telephone'], '+351968107702')
        self.assertEqual(len(graph[0]['sameAs']), 2)
        self.assertEqual(graph[1]['@type'], 'WebSite'); self.assertEqual(graph[2]['@type'], 'WebPage')
        self.assertIn('llms.txt', headers['link']); self.assertIn('type="text/plain"', headers['link'])

    def test_02_discovery_has_correct_mime_and_sitemap_is_valid(self):
        status, headers, body = self.request('/robots.txt')
        self.assertEqual(status, 200); self.assertTrue(headers['content-type'].startswith('text/plain'))
        self.assertIn('Content-Signal: search=yes, ai-train=no', body)
        self.assertIn('Sitemap: https://bonefree.pt/sitemap.xml', body)
        status, headers, body = self.request('/sitemap.xml'); self.assertEqual(status, 200)
        urls = [node.text for node in ET.fromstring(body).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        for path in json.loads((DIST/'agent-manifest.json').read_text())['pages']: self.assertIn('https://bonefree.pt'+path, urls)
        self.assertEqual(len(urls), len(set(urls))); self.assertLessEqual(len(urls), 50000)
        status, headers, body = self.request('/llms.txt')
        self.assertEqual(status, 200); self.assertTrue(headers['content-type'].startswith('text/plain'))
        self.assertTrue(body.startswith('# Bonefree\n\n> ')); self.assertIn('](https://bonefree.pt/menu.md)', body)
        cards = []
        for path in ['/.well-known/mcp/server-card.json', '/.well-known/mcp.json']:
            status, headers, body = self.request(path); self.assertEqual(status, 200)
            self.assertTrue(headers['content-type'].startswith('application/json')); cards.append(json.loads(body))
        self.assertEqual(cards[0], cards[1]); self.assertEqual(cards[0]['transport']['endpoint'], 'https://bonefree.pt/mcp')

    def test_03_markdown_negotiation_quality_canonical_cache_and_head(self):
        for path in json.loads((DIST/'agent-manifest.json').read_text())['pages']:
            status, headers, body = self.request(path, headers={'Accept': 'text/markdown'})
            self.assertEqual(status, 200); self.assertTrue(headers['content-type'].startswith('text/markdown'))
            self.assertTrue(body.startswith('# ')); self.assertNotIn('<html', body); self.assertIn('Accept', headers['vary'])
            self.assertIn(f'<https://bonefree.pt{path}>; rel="canonical"', headers['link'])
            file = '/index.md' if path == '/' else path+'.md'
            self.assertEqual(self.request(file)[2], body)
        for accept in ['text/markdown;q=0,text/html', 'text/html;q=1,text/markdown;q=0.2', 'text/*;q=1,text/markdown;q=0']:
            status, headers, body = self.request('/', headers={'Accept': accept})
            self.assertEqual(status, 200); self.assertTrue(headers['content-type'].startswith('text/html'))
        status, headers, body = self.request('/', 'HEAD', {'Accept': 'text/markdown'})
        self.assertEqual(status, 200); self.assertEqual(body, ''); self.assertIn('text/markdown', headers['content-type'])
        status, headers, body = self.request('/', headers={'Accept': 'text/markdown'})
        status, _, body = self.request('/', headers={'Accept': 'text/markdown', 'If-None-Match': headers['etag']})
        self.assertEqual(status, 304); self.assertEqual(body, '')
        self.assertEqual(self.request('/', headers={'Accept': 'text/markdown;q=0,text/html;q=0'})[0], 406)

    def test_04_missing_private_and_retired_paths_keep_http_statuses(self):
        for path in ['/agent-unknown-012345', '/missing.md', '/.well-known/not-real.json', '/agent.php?representation=mcp', '/dish.html']:
            for accept in ['text/html', 'text/markdown']:
                self.assertEqual(self.request(path, headers={'Accept': accept})[0], 404, path)
        self.assertEqual(self.request('/checkout')[0], 410)
        self.assertEqual(self.request('/menu/')[0], 301)
        self.assertEqual(self.request('/reservations/confirmation')[0], 200)
        self.assertIn('no-store', self.request('/reservations/confirmation')[1]['cache-control'])

    def test_05_mcp_initialization_tools_and_real_execution(self):
        status, headers, body = self.rpc('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'local-verifier', 'version': '1'}})
        self.assertEqual(status, 200); data = json.loads(body)['result']
        self.assertEqual(data['protocolVersion'], '2025-11-25'); self.assertEqual(data['capabilities'], {'tools': {'listChanged': False}})
        self.assertIn('no-store', headers['cache-control'])
        status, headers, body = self.request('/mcp', 'POST', {'Content-Type': 'application/json', 'Accept': 'application/json'}, json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'}))
        self.assertEqual(status, 202); self.assertEqual(body, '')
        status, _, body = self.rpc('tools/list'); tools = json.loads(body)['result']['tools']
        card = json.loads(self.request('/.well-known/mcp/server-card.json')[2]); self.assertEqual(card['tools'], tools)
        status, _, body = self.rpc('tools/call', {'name':'get_restaurant_info','arguments':{}})
        info = json.loads(json.loads(body)['result']['content'][0]['text']); self.assertEqual(info['telephone'], '+351968107702')
        status, _, body = self.rpc('tools/call', {'name':'get_public_page','arguments':{'page':'/menu'}})
        self.assertEqual(json.loads(body)['result']['content'][0]['text'], self.request('/menu.md')[2])
        self.assertEqual(self.rpc('ping')[0], 200)

    def test_06_mcp_validation_and_read_only_boundaries(self):
        self.assertEqual(self.request('/mcp')[0], 405)
        self.assertEqual(self.rpc('ping', Origin='https://evil.invalid')[0], 403)
        self.assertEqual(self.rpc('ping', **{'MCP-Protocol-Version':'invalid'})[0], 400)
        self.assertEqual(self.request('/mcp', 'POST', {'Content-Type':'text/plain'}, '{}')[0], 415)
        for payload, status in [('not-json',400), ('[]',400), ('x'*8193,413), (json.dumps({'jsonrpc':'2.0','id':None,'method':'ping'}),400)]:
            self.assertEqual(self.request('/mcp','POST',{'Content-Type':'application/json','Accept':'application/json'},payload)[0], status)
        for name, args in [('make_reservation',{}), ('get_public_page',{'page':'../../etc/passwd'}), ('get_public_page',{'page':'/admin/dashboard'}), ('get_restaurant_info',{'token':'private'})]:
            _, _, body = self.rpc('tools/call', {'name':name,'arguments':args}); self.assertEqual(json.loads(body)['error']['code'], -32602)
        _, _, body = self.rpc('admin/delete'); self.assertEqual(json.loads(body)['error']['code'], -32601)
        self.assertEqual(self.rpc('ping', Origin='https://bonefree.pt')[0], 200)


if __name__ == '__main__': unittest.main(verbosity=2)
