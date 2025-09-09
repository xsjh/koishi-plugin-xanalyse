import { Context, Schema, h, Logger } from 'koishi'
import {} from "koishi-plugin-puppeteer";

export const name = 'xanalyse'

export const logger = new Logger('xanalyse');

export const inject = { required: ["puppeteer", "database"] };

export const usage = `
<h1>X推送</h1>
<p><b>全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<p><b>跟随系统代理方式：</b>在proxy-agent代理服务器地址填写<code>http://127.0.0.1:7890</code>，如果不行请自行搜索<code>xx系统怎么查看本机的代理端口</code></p>
<p><b>请务必配置cookies信息，否则无法正常使用，获取方式：</b></p>
<ul>
<p> · 在浏览器中登录x.com，按F12打开开发者工具，点击Application</p>
<p> · 左侧Storage->cookies->https://x.com，找到Name为auth_token的那一行，复制此行Value值粘贴进cookies配置项即可</p>
</ul>
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
<p> · 现已支持第三方翻译api——siliconflow，选择模型请前往👉https://www.siliconflow.cn/ 点击左上角[产品]->siliconcloud，登录之后[邀请码:1ouyU0j5]即可在模型广场复制模型名称填入model选项<br><br>【推荐使用Pro/deepseek-ai/DeepSeek-V3，deepseek之外的模型没有测试过，可以自行试试】</p>
</ul>

<p><b>再次提醒：全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<hr>
<div class="version">
<h3>Version</h3>
<p>1.1.5</p>
<ul>
<li>修复了视频推文会固定发送至开发时使用的测试群聊的问题😅</li>
<li>增加了api翻译自定义prompt功能，现在可以自定义你的翻译偏好</li>
</ul>
</div>
<hr>
<h2>⚠！重要告示！⚠</h2>
<p><b>本插件开发初衷是为了方便在群内看女声优推特，切勿用于订阅推送不合规、不健康内容，一切后果自负！</b></p>
<hr>
<h4>如果想继续开发优化本插件，<a href="https://github.com/xsjh/koishi-plugin-xanalyse/pulls" target="_blank">欢迎 PR</a></h4>
</body>
`;

export interface Config {
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    account: Schema.string().required().description('机器人账号'),
    platform: Schema.string().required().description('机器人平台，例如onebot'),
    updateInterval: Schema.number().min(1).default(5).description('检查推文更新间隔时间（单位分钟），建议每多两个订阅增加1分钟'),
    cookies: Schema.string().required().description('x的登录cookies，获取方式往上翻看简介')
  }).description('基础设置'),

  Schema.object({
    whe_translate: Schema.boolean().default(false).description('是否启用推文翻译（接入deepseek v3）')
  }).description('翻译设置'),
  
  Schema.union([
    Schema.object({
      whe_translate: Schema.const(true).required(),
      apiKey: Schema.string().required().description('deepseek apiKey密钥<br>点此链接了解👉https://platform.deepseek.com/api_keys'),
      apiurl: Schema.string().default('https://api.deepseek.com').description('默认为ds官方api接口，若使用siliconcloud平台请自行修改为https://api.siliconflow.cn/v1</br>'),
      model: Schema.string().default('deepseek-chat').description('默认为ds官方模型，若要切换为siliconflow平台对应模型，请上滑页面查看Notice'),
      prompt: Schema.string().role('textarea').default('翻译成简体中文，直接给出翻译结果，不要有多余输出不要修改标点符号，如果遇到网址或者空白内容请不要翻译，请翻译: {text}').description('翻译使用的提示词，使用{text}表示需要翻译的文本')
    }),
    Schema.object({}),
  ]),

  Schema.object({
    bloggers: Schema.array(Schema.object({
      id: Schema.string().description('Twitter博主用户名, 输@之后的用户名即可，不要加上@'),
      groupID: Schema.array(String).role('table').description('需要推送的群号'),
    })).description('订阅的博主列表，例：elonmusk'),
  }).description('订阅的博主列表'),

  Schema.object({
    outputLogs: Schema.boolean().default(true).description('日志调试模式，开启以获得更多信息').experimental(),
  }).description('调试设置'),
]);

//声明数据表
declare module 'koishi' {
  interface Tables {
    xanalyse: Xanalyse
  }
}
//表的接口类型
export interface Xanalyse {
  id: string,
  link: string,
  content: string
}
export interface LatestResult {
  tweets: Array<{ link: string; isRetweet: boolean; isVideo: boolean }>;
  word_content: string;
}



export async function apply(ctx: Context, config, session) {
  // 创建数据库
  try {
    ctx.database.extend('xanalyse', {
      id: 'string',
      link: 'string',
      content: 'string'
    })
    logger.info('数据库初始化成功')
  } catch (error) {
    logger.error('数据库初始化失败', error)
  }

  // 先初始化数据库，把每个博主的最新链接存储进link列
  await init(config, ctx);
  
  // 定时推送
  ctx.setInterval(async () => { checkTweets(session, config, ctx) }, config.updateInterval * 60 * 1000);

  ctx.command('tt', '主动检查一次推文更新')
    .action(async ({ session }) => {
      await session.send("正在检查更新...");
      await checkTweets(session, config, ctx);
    });
  
  ctx.command('cs', '测试，开发专用')
    .action(async ({ session }) => {
      await session.send("正在测试...");
    });

  ctx.command('twitter [...arg]', '根据url获得twitter推文截图')
    .action(async ({ session }, ...arg) => {
      try {
        const url = arg.join(' ').trim();
        if (url == '') {
          await session.send("您输入的url为空");
        } else {
          // 判断x链接并获取内容
          await session.send("正在获取帖子截图...");
          logger.info('开始请求的推文连接：', url);
          const tpTweet = await getTimePushedTweet(ctx, ctx.puppeteer, url, config);
          // 判断是否为视频推文：如果tpTweet.mediaUrls中包含.mp4则为true
          const isVideo = tpTweet.mediaUrls && tpTweet.mediaUrls.some(url => url.endsWith('.mp4'));
          // 根据是否为视频推文构造不同的消息结构
          if (isVideo) {
            // 视频推文：先发送文字+截图
            let textMsg = `发布了一条视频推文：\n${tpTweet.word_content}\n`;
            textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
            // 只收集图片
            const imageUrls = tpTweet.mediaUrls.filter(url => !url.endsWith('.mp4'));
            let images: string[] = [];
            if (imageUrls.length > 0) {
              const imagePromises = imageUrls.map(async (imageUrl) => {
                let attempts = 0;
                const maxRetries = 3;
                while (attempts < maxRetries) {
                  try {
                    const response = await ctx.http.get(imageUrl, { 
                      responseType: 'arraybuffer',
                      headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                      }
                    });
                    return h.image(response, 'image/jpeg');
                  } catch (error) {
                    attempts++;
                    logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                    if (attempts >= maxRetries) {
                      logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                      return null;
                    }
                  }
                }
              });
              images = (await Promise.all(imagePromises)).filter((img) => img !== null);
              textMsg += `${images.join('\n')}`;
            }
            // 只发送第一个 mp4 视频
            const videoUrl = tpTweet.mediaUrls.find(url => url.endsWith('.mp4'));
            let video_response;
            if (videoUrl) {
              let attempts = 0;
              const maxRetries = 3;
              while (attempts < maxRetries) {
                try {
                  video_response = await ctx.http.get(videoUrl, { 
                    responseType: 'arraybuffer',
                    headers: { 
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                  });
                  if(config.outputLogs){
                    logger.info(`成功请求视频文件: ${videoUrl}`);
                  }
                  break;
                } catch (error) {
                  attempts++;
                  logger.error(`请求视频失败，正在尝试第 ${attempts} 次重试: ${videoUrl}`, error);
                  if (attempts >= maxRetries) {
                    logger.error(`请求视频失败，已达最大重试次数: ${videoUrl}`, error);
                  }
                }
              }
            }

            await session.send(textMsg);
            if (video_response) {
              await session.send(h.video(video_response, 'video/mp4'));
            }
          } else {
              // 图片推文
              let msg = `发布了一条图片推文：\n${tpTweet.word_content}\n`;
              msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
              if (tpTweet.mediaUrls && tpTweet.mediaUrls.length > 0) {
                  const imagePromises = tpTweet.mediaUrls.map(async (imageUrl) => {
                      let attempts = 0;
                      const maxRetries = 3;
                      while (attempts < maxRetries) {
                          try {
                              const response = await ctx.http.get(imageUrl, { 
                                  responseType: 'arraybuffer',
                                  headers: { 
                                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                  }
                              });
                              return h.image(response, 'image/jpeg');
                          } catch (error) {
                              attempts++;
                              logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                              if (attempts >= maxRetries) {
                                  logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                                  return null;
                              }
                          }
                      }
                  });
                  const images = (await Promise.all(imagePromises)).filter((img) => img !== null);
                  msg += `${images.join('\n')}`;
              }
              await session.send(msg);
          }       
        }
      } catch (error) {
        await session.send('获取推文内容失败', error);
        logger.info("获取推文截图过程失败", error);
      }
    });
}

async function getTimePushedTweet(ctx, pptr, url, config, maxRetries = 3) { // 获取需要推送的推文具体内容
  let page;
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      page = await pptr.page();
      await page.setCookie({ 
        name: 'auth_token', 
        value: `${config.cookies}`, 
        domain: '.x.com', 
        path: '/', 
        httpOnly: true, 
        secure: true 
      });
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
      
      // 设置超时时间
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // 等待推文容器渲染
      await page.waitForSelector('article', { timeout: 30000 });
      // 等待推文内所有图片加载完成
      await page.evaluate(async () => {
        const article = document.querySelector('article[data-testid="tweet"]') || document.querySelector('article');
        if (!article) return;
        const imgs = Array.from(article.querySelectorAll('img'));
        await Promise.all(imgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = img.onerror = resolve;
          });
        }));
      });
      // 检查是否为受保护账号
      const isProtected = await page.evaluate(() => {
        return !!document.querySelector('[aria-label="受保护账号"]');
      });

      // 定位到推文容器进行截图
      const element = await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
      if (!element) {
        throw new Error('未能找到推文容器');
      }
      const screenshotBuffer = await element.screenshot({ type: "webp" });

      if (isProtected) {
        // 受保护账号：只获取文字和截图，不返回媒体
        const word_content = await page.evaluate(() => {
          const el = document.querySelector('div[data-testid="tweetText"]');
          return el ? el.textContent.trim() : '';
        });
        const element = await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
        const screenshotBuffer = element ? await element.screenshot({ type: "webp" }) : null;
        return {
          word_content: `${word_content}\n（注：此账号为受保护账号，故不提供具体媒体内容）`,
          mediaUrls: [],
          screenshotBuffer
        };
      }else {
      // 请求 vxtwitter API
      const apiUrl = url.replace(/(twitter\.com|x\.com)/, 'api.vxtwitter.com');
      console.log('请求 API URL:', apiUrl);
      try {
        const apiResponse = await ctx.http.get(apiUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        console.log('成功接收到 vxtwitter API 的响应:', apiResponse);
        return {
          word_content: apiResponse.text,
          mediaUrls: apiResponse.media_extended ? apiResponse.media_extended.map(m => m.url) : [],
          screenshotBuffer
        };
             } catch (err) {
         logger.error('请求 vxtwitter API 失败:', err);
         // 如果API请求失败，返回空结果
         return {
           word_content: '',
           mediaUrls: [],
           screenshotBuffer
         };
       }
      }
    } catch (error) {
      attempts++;
      logger.error(`获取推文内容失败，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= maxRetries) {
        logger.error(`获取推文内容失败，已达最大重试次数。推文链接：${url}`, error);
        return {
          word_content: '',
          mediaUrls: [],
          screenshotBuffer: null
        };
      }
      // 在重试之间添加延迟
      await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}

async function getLatestTweets(pptr, url, config, maxRetries = 3): Promise<LatestResult> {// 获得订阅博主最新推文url和判重内容
  let page;
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      page = await pptr.page();
      // 设置页面性能优化
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        // 阻止加载不必要的资源以提高速度
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      await page.setCookie({ 
        name: 'auth_token', 
        value: `${config.cookies}`, 
        domain: '.x.com', 
        path: '/', 
        httpOnly: true, 
        secure: true 
      });
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await page.waitForSelector('article', { timeout: 30000 });
      const result = await page.evaluate(() => {
        const articles = Array.from(document.querySelectorAll('article'));
        const collected = [];
        for (const article of articles) {
          // 跳过置顶
          const isPinned = !!(
            article.querySelector('svg[aria-label="Pinned"]') ||
            Array.from(article.querySelectorAll('span')).some(s => /pinned|置顶|置頂/i.test(s.textContent || '')) ||
            /pinned|置顶|置頂/i.test(((article.previousElementSibling || {}).textContent || '') + ((article.parentElement || {}).textContent || ''))
          );
          if (isPinned) continue;
          // 文本
          const textEl = article.querySelector('div[data-testid="tweetText"], div[lang]');
          const word_content = (textEl && textEl.textContent ? textEl.textContent : '').trim();
          // 链接
          const linkEl = article.querySelector('a[href*="/status/"]');
          const href = (linkEl && linkEl.getAttribute('href')) || '';
          if (!href) continue;
          // 是否转推
          const social = article.querySelector('[data-testid="socialContext"]');
          const headerText = (((article.previousElementSibling || {}).textContent || '') + ((article.parentElement || {}).textContent || '') + ((social || {}).textContent || ''));
          const isRetweet = /retweeted|转推|轉推/i.test(headerText);
          // 是否视频
          const isVideo = !!(
            article.querySelector('div[data-testid="videoPlayer"]') ||
            article.querySelector('video') ||
            Array.from(article.querySelectorAll('svg[aria-label], div[aria-label]')).some(n => /video|播放|影片|视频/i.test(n.getAttribute('aria-label') || ''))
          );
          let absolute = href;
          if (absolute.startsWith('/')) absolute = 'https://x.com' + absolute;
          if (!absolute.startsWith('http')) absolute = 'https://x.com/' + absolute;
          collected.push({ link: absolute, isRetweet, word_content, isVideo });
        }
        const latest = collected.slice(0, 1);
        return {
          tweets: latest.map(t => ({ link: t.link, isRetweet: t.isRetweet, isVideo: t.isVideo })),
          word_content: latest.length ? latest[0].word_content : ''
        };
      });
      return result;
    } catch (error) {
      attempts++;
      logger.error(`测试抓取失败，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= maxRetries) {
        logger.error('测试抓取失败，已达最大重试次数。', error);
        return { tweets: [], word_content: '' };
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}

async function checkTweets(session, config, ctx) { // 更新一次推文
  try {
    const baseUrl = 'https://x.com';
    for (const blogger of config.bloggers) {
      const { id, groupID } = blogger;
      const bloggerUrl = `${baseUrl}/${id}`;
      const timenow = await getTimeNow();
      if (config.outputLogs) {
        logger.info('当前时间：', timenow, '本次请求的博主与链接：', id, bloggerUrl);
      }
      try {
        const result = await getLatestTweets(ctx.puppeteer, bloggerUrl, config);
        if (config.outputLogs) {
          logger.info('主函数返回的推文信息：', result);
        }
        if (!result) {
          if (config.outputLogs) logger.info(`博主 ${id} 暂无新推文`);
          continue;
        }

        // 判重
        const latestTweetLink = result.tweets.length > 0 ? result.tweets[0].link : null;
        const latestTweetcontent = result.tweets.length > 0 ? result.word_content : null;
        const DateResult = await ctx.database.get('xanalyse', { id: id });
        const existingTweetLink = DateResult[0]?.link || '';
        const existingContent = DateResult[0]?.content || '';
        // 若本次未成功获取到最新推文链接，则跳过以避免覆盖为null
        if (!latestTweetLink) {
            if (config.outputLogs) {
              logger.info(
                `本次未获取到博主 ${id} 的最新推文链接，跳过推文链接更新`
              );
            }
            continue;
          }
        if (config.outputLogs) {
          logger.info('当前已存储推文历史：', existingTweetLink);
          logger.info('本次获取的最新推文：', latestTweetLink);
        }
        if (!existingTweetLink || existingTweetLink !== latestTweetLink) {
          if (config.outputLogs) {
            logger.info('结果：', existingTweetLink, '不等于', latestTweetLink, '准备更新并推送新推文');
          }
          await ctx.database.upsert('xanalyse', [
            { id, link: latestTweetLink, content: latestTweetcontent },
          ]);
          // 获取具体内容
          const tpTweet = await getTimePushedTweet(ctx, ctx.puppeteer, latestTweetLink, config);
          if (config.outputLogs) {
            logger.info(`推文文字：${tpTweet.word_content}`);
            logger.info('推文媒体url:', tpTweet.mediaUrls.map(url => url).join(', '));
          }
          const isRetweet = result.tweets[0].isRetweet;
          // 判断是否为视频推文：如果tpTweet.mediaUrls中包含.mp4则为true
          const isVideo = tpTweet.mediaUrls && tpTweet.mediaUrls.some(url => url.endsWith('.mp4'));
          // 根据config决定是否翻译推文
          let tweetWord;
          if (config.whe_translate === true && config.apiKey) {
            const translation = await translate(tpTweet.word_content, ctx, config);
            console.log('翻译结果', translation);
            tweetWord = translation;
          } else {
            tweetWord = tpTweet.word_content;
          }

          // 准备botkey
          const botKey = `${config.platform}:${config.account}`;
          
          // 根据是否为视频推文构造不同的消息结构
          if (isVideo) {
            // 视频推文：先发送文字+截图
            let textMsg = `【${id}】 发布了一条视频推文：\n${tweetWord}\n`;
            if (isRetweet) {
                textMsg += "[提醒：这是一条转发推文]\n";
            }
            textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
            // 收集图片
            const imageUrls = tpTweet.mediaUrls.filter(url => !url.endsWith('.mp4'));
            let images: string[] = [];
            if (imageUrls.length > 0) {
              const imagePromises = imageUrls.map(async (imageUrl) => {
                let attempts = 0;
                const maxRetries = 3;
                while (attempts < maxRetries) {
                  try {
                    const response = await ctx.http.get(imageUrl, { 
                      responseType: 'arraybuffer',
                      headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                      }
                    });
                    return h.image(response, 'image/jpeg');
                  } catch (error) {
                    attempts++;
                    logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                    if (attempts >= maxRetries) {
                      logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                      return null;
                    }
                  }
                }
              });
              images = (await Promise.all(imagePromises)).filter((img) => img !== null);
              textMsg += `${images.join('\n')}`;
            }
            // 单独发送mp4视频
            const videoUrl = tpTweet.mediaUrls.find(url => url.endsWith('.mp4'));
            let video_response;
            if (videoUrl) {
              let attempts = 0;
              const maxRetries = 3;
              while (attempts < maxRetries) {
                try {
                  video_response = await ctx.http.get(videoUrl, { 
                    responseType: 'arraybuffer',
                    headers: { 
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                  });
                  if(config.outputLogs){
                    logger.info(`成功请求视频文件: ${videoUrl}`);
                  }
                  break;
                } catch (error) {
                  attempts++;
                  logger.error(`请求视频失败，正在尝试第 ${attempts} 次重试: ${videoUrl}`, error);
                  if (attempts >= maxRetries) {
                    logger.error(`请求视频失败，已达最大重试次数: ${videoUrl}`, error);
                  }
                }
              }
            }

            for (const groupId of groupID) {
              await ctx.bots[botKey].sendMessage(groupId, textMsg);
              if (video_response) {
                await ctx.bots[botKey].sendMessage(groupId, h.video(video_response, 'video/mp4'));
              }
            }
          } else {
              // 图片推文
              let msg = `【${id}】 发布了一条图片推文：\n${tweetWord}\n`;
              if (isRetweet) {
                  msg += "[提醒：这是一条转发推文]\n";
              }
              msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
              if (tpTweet.mediaUrls && tpTweet.mediaUrls.length > 0) {
                  const imagePromises = tpTweet.mediaUrls.map(async (imageUrl) => {
                      let attempts = 0;
                      const maxRetries = 3;
                      while (attempts < maxRetries) {
                          try {
                              const response = await ctx.http.get(imageUrl, { 
                                  responseType: 'arraybuffer',
                                  headers: { 
                                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                  }
                              });
                              return h.image(response, 'image/jpeg');
                          } catch (error) {
                              attempts++;
                              logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                              if (attempts >= maxRetries) {
                                  logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                                  return null;
                              }
                          }
                      }
                  });
                  const images = (await Promise.all(imagePromises)).filter((img) => img !== null);
                  msg += `${images.join('\n')}`;
              }
              for (const groupId of groupID) {
                  await ctx.bots[botKey].sendMessage(groupId, msg);
              }
          }
      }else {
          if (config.outputLogs) {
            logger.info(`已发送过博主 ${id} 的最新推文，跳过`);
          }
        }
      } catch (error) {
        logger.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl}`, error);
        console.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl}`, error);
        await session.send(`加载博主 ${id} 的页面时出错，可能是网络问题或链接不合法。请检查链接的合法性或稍后重试。`);
      }
    }
  } catch (error) {
    logger.error('主函数错误：', error);
    console.error('主函数错误：', error);
    await session.send('获取推文时出错，请检查网页链接的合法性或稍后重试。');
  }
}

async function init(config, ctx) {// 初始化数据库
  try {
    // 获取数据库中已存在的博主id，并过滤
    const existingIds = await ctx.database.get('xanalyse', {}, ['id']);
    const existingIdSet = new Set(existingIds.map(item => item.id));
    const newBloggers = config.bloggers.filter(blogger => !existingIdSet.has(blogger.id));
    if (config.outputLogs) {
      logger.info(`[初始化]数据库中已存在的博主id：${Array.from(existingIdSet).join(', ')}`);
      logger.info(`[初始化]需要初始化的博主id：${newBloggers.map(blogger => blogger.id).join(', ')}`);
    }
    // 遍历博主id并挨个请求最新推文url
    const baseUrl = 'https://x.com';
    for (const blogger of newBloggers) {
      const { id, groupID } = blogger;
      const bloggerUrl = `${baseUrl}/${id}`;
      const timenow = await getTimeNow();
      if (config.outputLogs) {
        logger.info('[初始化]当前时间：', timenow, '本次请求的博主:', id, '链接：', bloggerUrl);
        logger.info('[初始化]当前博主推送群号：', groupID);
      }
      try {
        const { tweets, word_content} = await getLatestTweets(ctx.puppeteer, bloggerUrl, config);
        if (config.outputLogs) {
          logger.info('[初始化]主函数返回的推文信息：', tweets[0].link, word_content);
        }
        // 检查url是否获取成功
        if (tweets.length > 0) {
          await ctx.database.upsert('xanalyse', [
            { id, link: tweets[0].link, content: word_content}
          ])
        }
      } catch (error) {
        logger.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl},请检查博主id是否正确，注意：id前不需要有@`, error);
      }
    }
    logger.info('初始化加载订阅完成！')
  } catch (error) {
    logger.error('初始化链接失败', error);
  }
}

async function getTimeNow() {// 获得当前时间
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const formattedDate = formatter.format(now);
  return formattedDate
}

async function translate(text: string, ctx, config) { // 翻译推文
  const url = config.apiurl + '/chat/completions';
  const model = config.model
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  const data = {
    model: model,
    messages: [
      // { role: 'system', content: "你是一个翻译助手" },
      { role: 'user', content: config.prompt.replace('{text}', text) },
    ],
    stream: false,
  };
  try {
    const response = await ctx.http.post(url, data, { headers });
    if(config.outputLogs){
      logger.info('翻译api返回结果：',response); 
    }
    console.log('翻译结果：', response.choices[0].message.content);
    const translation = response.choices[0].message.content;
    return translation;
  } catch (err) {
    logger.error('翻译失败，请检查api余额或检查api是否配置正确：', err);
    return '翻译失败，请检查api余额或检查api是否配置正确';
  }
}
