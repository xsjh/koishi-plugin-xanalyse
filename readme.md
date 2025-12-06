# koishi-plugin-xanalyse

[![npm](https://img.shields.io/npm/v/koishi-plugin-xanalyse?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-xanalyse)

<h1>X推送</h1>
<p><b>全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<p><b>跟随系统代理方式：</b>在proxy-agent代理服务器地址填写<code>http://127.0.0.1:7890</code></p>
<p>数据来源于 <a href="https://x.com" target="_blank">x.com</a></p>
<hr>
<h2>Tutorials</h2>
<h3> ⭐️推文翻译功能需要前往<a href="https://platform.deepseek.com/usage" target="_blank">deepseek开放平台</a>申请API Keys并充值⭐️</h3>
<h4>指令介绍：</h4>
<p><b>twitter</b></p>
<ul>
<p> · 输入<code>twitter 推特帖子链接</code>即可获取此帖子的截图和以及翻译的内容和具体图片</p>
<p>例：twitter https://x.com/tim_cook/status/1914665497565798835</p>
</ul>
<p><b>tt:</b></p>
<ul>
<p> · 发送<code>tt</code>后会自动检查一遍当前订阅的博主的最新推文</p>
<br>
</ul>
<p><b>📢注意：在填写完博主用户名后若初始化失败，请打开日志调试模式，手动点击生成的博主链接，查看是否正确引导至博主页面。若有误则可能因为博主id填写有误</b></p>
<hr>
<h3>Notice</h3>
<ul>
<p> · 刚启动此插件的时候会初始化获取一遍订阅博主的最新推文并存入数据库，然后才会开始监听更新的推文</p>
<p> · 翻译功能支持任意兼容 OpenAI API 格式的第三方服务，只需在配置中修改 <code>apiurl</code> 和 <code>model</code> 即可使用</p>
</ul>

<h4>Link Detection</h4>
<ul>
<p> · 新增配置项 <code>detectXLinks</code>（默认：<code>true</code>），用于启用或禁用插件对 X/Twitter 链接的自动检测。</p>
<p> · 当启用时，插件会在收到含有 <code>x.com</code>、<code>twitter.com</code> 或短链 <code>t.co</code> 的消息时自动识别并获取推文内容。</p>
<p> · 若聊天中链接较多或担心性能影响，可将 <code>detectXLinks</code> 设为 <code>false</code> 以关闭该检测。</p>
</ul>

<p><b>再次提醒：全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<hr>
<div class="version">
<h3>Version</h3>
<p>1.3.0</p>
<ul>
<li>新增 X/Twitter 链接自动检测功能（可通过 detectXLinks 配置开关）</li>
<li>新增图片 ALT 文本提取与显示</li>
<li>新增可配置消息前缀（messagePrefix，默认："获取了"）</li>
<li>优化截图逻辑，支持头像检测与边界框计算</li>
<li>twitter 命令现支持翻译功能</li>
</ul>
<p>1.2.0</p>
<ul>
<li>增加了违禁词识别功能</li>
</ul>
<p>1.0.3</p>
<ul>
<li>对数据库中已存在的博主不再重复初始化，大幅提升插件初始化速度</li>
<li>增加了更多的日志输出信息</li>
</ul>
<p>1.0.2</p>
<ul>
<li>修复了required和default复用导致的推文内容翻译功能错误</li>
<li>为推文截图命令twitter，增加了翻译推文内容+获取推文图片功能，不只是单纯的截图</li>
</ul>
</div>
<hr>
<h2>⚠！重要告示！⚠</h2>
<p><b>本插件开发初衷是为了方便在群内看女声优推特，切勿用于订阅推送不合规、不健康内容，一切后果自负！</b></p>
</body>
