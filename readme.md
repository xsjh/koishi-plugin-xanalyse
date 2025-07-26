# koishi-plugin-xanalyse

[![npm](https://img.shields.io/npm/v/koishi-plugin-xanalyse?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-xanalyse)

<h1>X推送</h1>
<p><b>全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<p><b>跟随系统代理方式：</b>在proxy-agent代理服务器地址填写<code>http://127.0.0.1:7890</code></p>
<p>数据来源于 <a href="https://nitter.net/" target="_blank">nitter.net</a></p>
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
<p><b>📢注意：因为本插件基于镜像站，在填写完博主用户名后若初始化失败，请打开日志调试模式，手动点击生成的博主链接，查看是否正确引导至博主页面。若有误则可能因为博主id填写有误，请修改</b></p>
<hr>
<h3>Notice</h3>
<ul>
<p> · 刚启动此插件的时候会初始化获取一遍订阅博主的最新推文并存入数据库，然后才会开始监听更新的推文</p>
<p> · 现已支持第三方翻译api——siliconflow，选择模型请前往👉https://www.siliconflow.cn/ 点击左上角[产品]->siliconcloud，登录之后[邀请码:1ouyU0j5]即可在模型广场复制模型名称填入model选项<br><br>【推荐使用Pro/deepseek-ai/DeepSeek-V3，deepseek之外的模型没有测试过，可以自行试试】</p>
</ul>

<p><b>再次提醒：全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<hr>
<div class="version">
<h3>Version</h3>
<p>1.0.2</p>
<ul>
<li>修复了required和default复用导致的推文内容翻译功能错误</li>
<li>为推文截图命令twitter，增加了翻译推文内容+获取推文图片功能，不只是单纯的截图</li>
</ul>
<p>1.0.3</p>
<ul>
<li>对数据库中已存在的博主不再重复初始化，大幅提升插件初始化速度</li>
<li>增加了更多的日志输出信息</li>
</ul>
</div>
<hr>
<h2>⚠！重要告示！⚠</h2>
<p><b>本插件开发初衷是为了方便在群内看女声优推特，切勿用于订阅推送不合规、不健康内容，一切后果自负！</b></p>
</body>
