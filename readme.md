# koishi-plugin-xanalyse

[![npm](https://img.shields.io/npm/v/koishi-plugin-xanalyse?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-xanalyse)

<h1>X推送</h1>
<p><b>全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<p><b>跟随系统代理方式：</b>在proxy-agent代理服务器地址填写<code>http://127.0.0.1:7890</code></p>
<p>数据来源于 <a href="https://x.com" target="_blank">x.com</a></p>
<hr>
<h2>Tutorials</h2>
<h3> ⭐️推文翻译功能需要配置可用的 API Key，并确保对应服务账户可正常调用⭐️</h3>
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
<p>1.4.2</p>
<p><b>功能更新</b></p>
<ul>
<li>新增配置项：<code>screenshotHighQualityMode</code>（高质量模式，开启后截图使用 <code>deviceScaleFactor=2</code>）</li>
<li>优化截图链路：固定截图 viewport（<code>1280x2200</code>，<code>deviceScaleFactor=1</code>），统一滚动定位与布局稳定检测流程</li>
<li>优化截图抗干扰能力：截图前临时隐藏高风险 <code>fixed/sticky</code> 浮层并冻结动画，截图后自动恢复页面状态</li>
<li>优化配置页说明：Version 区块精简为“更新记录请参考顶部插件主页”</li>
</ul>
<p><b>修复说明</b></p>
<ul>
<li>修复推文截图偶发区域偏移、错位的问题</li>
<li>修复推文截图偶发白色画面的问题</li>
<li>缓解截图中偶发黑色圆点等浮层干扰问题</li>
</ul>
<p>1.4.1</p>
<p><b>功能更新</b></p>
<ul>
<li>新增配置项：<code>screenshotExtraWaitMs</code>（截图前额外等待时间，毫秒）</li>
<li>优化图片译文展示：多图场景下每个图片译文块之间增加空行</li>
</ul>
<p><b>修复说明</b></p>
<ul>
<li>修复图片无文字时，图片译文可能误复用正文译文的问题</li>
<li>修复图片译文字段解析兼容性问题（支持 <code>图片译文</code> / <code>图片1译文</code> / <code>[图片译文]</code> / <code>[图片1译文]</code> 等格式）</li>
<li>修复无有效图片译文时仍可能出现图片译文空段落的问题</li>
</ul>
<p>1.4.0</p>
<p><b>功能更新</b></p>
<ul>
<li>新增 LLM 图片输入翻译链路（可选启用），支持正文/图片/ALT 联合处理</li>
<li>新增配置项：<code>llmImageInputEnabled</code>、<code>llmImageInputLimit</code>、<code>llmImageInputSizeLimitKB</code></li>
<li>新增配置项：<code>translationBilingual</code>（双语/仅译文显示开关）</li>
<li>优化图片处理链路：图片超限自动压缩，超出数量分批翻译并保留批次上下文</li>
<li>优化图片翻译展示：单图显示 <code>[图片译文]</code>，多图显示 <code>[图片1译文]</code>、<code>[图片2译文]</code> 等</li>
<li>优化链接检测防重：跳过手动 <code>twitter</code> 命令触发的二次自动处理，并对同消息重复链接去重</li>
<li>优化媒体处理性能与兼容性：按真实 MIME 发送图片，同一推文内复用媒体缓存，图片预处理改为小并发（保序）</li>
</ul>
<p><b>修复说明</b></p>
<ul>
<li>修复媒体推文仅含 <code>t.co</code> 占位链接时被误显示为正文的问题</li>
<li>修复图片无文字场景下可能输出空图片翻译字段的问题</li>
<li>修复图片翻译在模型返回非标准格式时可能丢失有效结果的问题（增加解析兜底）</li>
</ul>
<p>1.3.1</p>
<p><b>功能更新</b></p>
<ul>
<li>新增抓取失败重试次数配置（fetchRetries）</li>
<li>新增翻译接口重试次数配置（translateRetries）</li>
<li>X/Twitter 链接检测功能移出实验性配置</li>
<li>优化翻译提示词默认预设（不覆盖用户自定义 prompt）</li>
</ul>
<p><b>修复说明</b></p>
<ul>
<li>抓取与翻译失败增加重试退避，缓解偶发失败</li>
<li>无会话场景下不再触发发送报错</li>
</ul>
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
