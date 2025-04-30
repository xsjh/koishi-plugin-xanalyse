import {Context, Schema, h, Logger} from 'koishi'
import Puppeteer, {} from "koishi-plugin-puppeteer";
import OpenAI from "openai";


export const name = 'xanalyse'

export const logger = new Logger('xanalyse');

export const inject = {required:["puppeteer"]};

export const usage = `
<h1>X推送</h1>
<p><b>全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<p>跟随系统代理方式：在proxy-agent代理服务器地址填写<code>http://127.0.0.1:7890</code></p>
<p>数据来源于 <a href="https://nitter.net/" target="_blank">nitter.net</a></p>
<hr>
<h2>Tutorials</h2>
<h3> ⭐️推文翻译功能需要前往<a href="https://platform.deepseek.com/usage" target="_blank">deepseek开放平台</a>申请API Keys并充值⭐️</h3>
<h4>指令介绍：</h4>
<p><b>twitter</b></p>
<ul>
<p> · 输入<code>twitter 推特帖子链接</code>即可获取此帖子的截图</p>
<p>例：twitter https://x.com/tim_cook/status/1914665497565798835</p>
</ul>
<p><b>tt:</b></p>
<ul>
<p> · 发送<code>tt</code>后会自动检查一遍当前订阅的博主的最新推文（实验性）</p>
</ul>
<hr>
<h3>Notice</h3>
<p>Onebot 适配器下，偶尔发不出来图，Koishi 报错日志为 <code>retcode:1200</code> 时，请查看协议端日志自行解决！</p>
<p><b>再次提醒：全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<hr>
<div class="version">
<h3>Version</h3>
<p>0.0.2</p>
<ul>
<li>完成了基本功能，健壮性仍待加强</li>
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
    updateInterval: Schema.number().min(1).default(5).description('检查推文更新间隔时间，建议每增加一个订阅增加30s')
  }).description('基础设置'),
  
  Schema.object({
    whe_translate: Schema.boolean().default(false).description('是否启用推文翻译（接入deepseek v3）')
  }).description('图文翻译设置'),
  Schema.union([
    Schema.object({
      whe_translate: Schema.const(true).required(),
      apiKey:Schema.string().required().description('deepseek apiKey密钥<br>点此链接了解👉https://platform.deepseek.com/api_keys')
    }),
    Schema.object({}),
  ]),

  Schema.object({
    bloggers: Schema.array(Schema.object({
      id: Schema.string().description('Twitter博主用户名'),
      groupID: Schema.string().description('需要推送的群号'),    
    })).description('订阅的博主列表'),
  }).description('订阅的博主列表'),
  Schema.object({
    outputLogs: Schema.boolean().default(true).description('日志调试模式，开启以获得更多信息').experimental(),
  }).description('调试设置'),
]);



export async function apply(ctx: Context, config, session) {

  

  // 初始化数组，用于存储每个博主的最新推文链接
  let sentTweetUrls: { id: string; link: string | null }[] = config.bloggers.map(blogger => ({
    id: blogger.id,
    link: null
  }));
  

  // 定时推送功能
  ctx.setInterval(async () => {
    try {
      // 遍历博主id并挨个请求最新推文url
      const baseUrl = 'https://nitter.net'; // 替换为实际的 Nitter 镜像站地址
      for (const blogger of config.bloggers) {
        const { id, groupID } = blogger;
        const bloggerUrl = `${baseUrl}/${id}`;
        const timenow = await getTimeNow();
        if (config.outputLogs) {
          logger.info('当前时间：', timenow, '本次请求的博主与链接：', id, bloggerUrl);
        }
        console.log('当前时间：', timenow, '本次请求的博主与链接：', id, bloggerUrl);
  
        try {
          const latestTweets = await getLatestTweets(ctx.puppeteer, bloggerUrl, config);
          if (config.outputLogs) {
            logger.info('主函数返回的推文信息：', latestTweets);
          }
          console.log('主函数返回的推文信息：', latestTweets);
  
          // 检查url是否获取成功
          if (latestTweets.length > 0) {
            const latestTweetLink = latestTweets[0].link;
            // 检查是否已经发送过该推文
            console.log('当前已存储推文历史：', sentTweetUrls);
            const existingTweet = sentTweetUrls.find(item => item.id === id);
  
            if (existingTweet && existingTweet.link !== latestTweetLink) { // 未发送的情况
              existingTweet.link = latestTweetLink; // 更新链接
              const isRetweet = latestTweets[0].isRetweet;
              const url = `${baseUrl}${latestTweetLink}`;
              console.log('拼接后的推文url：', url);
              if (config.outputLogs) {
                logger.info('拼接后的推文url：', url);
              }
  
              // 获得推文具体内容
              const tpTweet = await getTimePushedTweet(ctx.puppeteer, url);
              if (config.outputLogs) {
                logger.info(`
                  推文文字：${tpTweet.word_content}
                `);
              }
              console.log(`
                推文文字：${tpTweet.word_content}
              `);

              // 请求图片url
              const fullImgUrls = tpTweet.imgUrls.map(src => `${baseUrl}${src}`);
              const imagePromises = fullImgUrls.map(async (imageUrl) => {
                let attempts = 0;
                const maxRetries = 3;
                while (attempts < maxRetries) {
                  try {
                    const response = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' });
                    return h.image(response, 'image/webp'); // 根据图片格式调整 MIME 类型
                  } catch (error) {
                    attempts++;
                    logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                    console.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                    if (attempts >= maxRetries) {
                      logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                      console.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                      return null;
                    }
                  }
                }
              });
              const images = (await Promise.all(imagePromises)).filter((img) => img !== null); // 过滤掉请求失败的图片
              
              // 根据config决定是否翻译推文
              let tweetWord;
              if (config.whe_translate === true && config.apiKey){
                const translation = await translate(tpTweet.word_content , ctx, config);
                console.log('翻译结果',translation);
                tweetWord = translation;
              }else{
                tweetWord = tpTweet.word_content;
              }
              
              // 构造消息内容并发送
              let msg = `【${id}】 发布了一条推文：\n${tweetWord}\n`;
              if (isRetweet) {
                msg += "[提醒：这是一条转发推文]\n";
              }
              msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
              msg += `${images.join('\n')}\n
              链接：${url}`;
              const botKey = `${config.platform}:${config.account}`;
              await ctx.bots[botKey].sendMessage(groupID, msg);
            } else {
              if (config.outputLogs) {
                logger.info(`已发送过博主 ${id} 的最新推文，跳过`);
              }
              console.log(`已发送过博主 ${id} 的最新推文，跳过`);
            }
          }
        } catch (error) {
          // 如果当前博主处理出错，记录日志并跳过当前博主
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
  }, config.updateInterval * 60 * 1000);
 
  
  

  
  ctx.command('tt','主动检查一次推文更新')
    .action(async ({session}) => {
      await session.send("正在检查更新...");
      await checkTweets(session, config, ctx, sentTweetUrls);
      // const is_imgurl = await getTimePushedTweet(ctx.puppeteer,'https://nitter.net/SECNAV/status/1917191078677299333');
      // console.log('是否存在url', is_imgurl.imgUrls);
    });

  ctx.command('twitter [...arg]', '根据url获得twitter推文截图')
    .action(async ({session}, ...arg) => {
      try {
        const url = arg.join(' ').trim();
        if (url == ''){
        await session.send("您输入的url为空");
        }else{
          // 判断x链接并获取内容
          await session.send("正在获取帖子截图...");
          const imgBuffer = await getScreenShot(ctx.puppeteer, url);
          await session.send(h.image(imgBuffer,"image/webp"));
        }
      } catch (error) {
        if(config.outputLogs === true){
          logger.info("获取推文截图过程失败", error);
        }
        console.log("获取推文截图过程失败", error);
      }
    });
}



async function getTimePushedTweet(pptr, url, maxRetries = 3) {// 获得推文具体内容
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const page = await pptr.page(); // 初始化浏览器
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.reload({ waitUntil: 'networkidle0' }); // 防止加载不出刷新页面

      // 1、定位到元素
      const element = await page.$('div.timeline-item');
      if (!element) {
        throw new Error('未能找到指定的元素');
      }

      // 2、移除遮挡的 div 元素
      await page.evaluate(() => {
        const overlayDiv = document.querySelector('nav');   
        if (overlayDiv) {overlayDiv.remove();}else{
          console.log('未找到nav');
        }       
      });

      // 2、获取推文文字内容
      const word_content = await page.evaluate(() => {
        const txt_element = document.querySelector('div.tweet-content.media-body');
        if (!txt_element) {
          console.error('未获取推文文字内容');
          return '';
        }
        let textContent = txt_element.textContent || '';
        return textContent.trim();
      });

      // 3、获取推文完整截图
      const screenshotBuffer = await element.screenshot({ type: "webp" }); // 获取完整截图

      // 4、获取推文图片url
      const imgUrls = await page.evaluate(() => {
        // 检查是否存在 div.attachments.card 元素
        const hasAttachmentsCard = document.querySelector('div.attachments.card');
        if (hasAttachmentsCard) {// 如果存在 div.attachments.card，则不获取图片 URL
          return [];
        }
        // 不存在的情况下，获取图片 URL
        const firstTimelineItem = document.querySelector('div.gallery-row');
        if (!firstTimelineItem) return [];
        const imgElements = firstTimelineItem.querySelectorAll('img');
        const srcs = [];
        for (const imgElement of imgElements) {
          const src = imgElement.getAttribute('src');
          if (src) {
            srcs.push(src);
          }
        }
        return srcs;
      });
      

      await page.close();
      return {
        word_content,
        imgUrls,
        screenshotBuffer
      };
    } catch (error) {
      attempts++;
      logger.error(`获取推文内容失败，正在尝试第 ${attempts} 次重试...`, error);
      console.error(`获取推文内容失败，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= maxRetries) {
        logger.error(`获取推文内容失败，已达最大重试次数。推文链接：${url}`, error);
        console.error(`获取推文内容失败，已达最大重试次数。推文链接：${url}`, error);
        return {
          word_content: '',
          imgUrls: [],
          screenshotBuffer: null
        };
      }
    }
  }
}

async function getLatestTweets(pptr, url, config, maxRetries = 3) {// 获得订阅博主最新推文url
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const page = await pptr.page();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.reload({ waitUntil: 'networkidle0' }); // 刷新页面

      const tweets = await page.evaluate((config) => {
        const timelineItems = document.querySelectorAll('div.timeline-item');
        console.log('timelineitems_all:', timelineItems);
        const tweetLinks = [];

        for (const item of timelineItems) {
          const pinned = item.querySelector('div.pinned');
          if (pinned) continue; // 跳过置顶推文

          const retweetHeader = item.querySelector('div.retweet-header');
          const isRetweet = retweetHeader ? true : false; // 检查是否为转发推文

          const tweetLink = item.querySelector('a.tweet-link');
          if (config.outputLogs) {
            console.log('本次获取的tweetLink:', tweetLink);
          }
          if (tweetLink) {
            tweetLinks.push({
              link: tweetLink.getAttribute('href'),
              isRetweet: isRetweet, // 添加转发标志
            });
            if (config.outputLogs) {
              console.log('存储的tweetLinks', tweetLinks);
            }
          }
        }
        return tweetLinks.slice(0, 1); // 获取最新推文
      }, config);

      await page.close();
      return tweets;
    } catch (error) {
      attempts++;
      console.error(`获取博主 ${url} 的推文时出错，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= maxRetries) {
        console.error(`获取博主 ${url} 的推文时出错，已达最大重试次数。`, error);
        return [];
      }
    }
  }
}

async function checkTweets(session, config, ctx, sentTweetUrls) {// 手动更新一次推文
  try {
    // 遍历博主id并挨个请求最新推文url
    const baseUrl = 'https://nitter.net'; // 替换为实际的 Nitter 镜像站地址
    for (const blogger of config.bloggers) {
      const { id, groupID } = blogger;
      const bloggerUrl = `${baseUrl}/${id}`;
      const timenow = await getTimeNow();
      if (config.outputLogs) {
        logger.info('当前时间：', timenow, '本次请求的博主与链接：', id, bloggerUrl);
      }
      console.log('当前时间：', timenow, '本次请求的博主与链接：', id, bloggerUrl);

      try {
        const latestTweets = await getLatestTweets(ctx.puppeteer, bloggerUrl, config);
        if (config.outputLogs) {
          logger.info('主函数返回的推文信息：', latestTweets);
        }
        console.log('主函数返回的推文信息：', latestTweets);

        // 检查url是否获取成功
        if (latestTweets.length > 0) {
          const latestTweetLink = latestTweets[0].link;
          // 检查是否已经发送过该推文
          console.log('当前已存储推文历史：', sentTweetUrls);
          const existingTweet = sentTweetUrls.find(item => item.id === id);

          if (existingTweet && existingTweet.link !== latestTweetLink) { // 未发送的情况
            existingTweet.link = latestTweetLink; // 更新链接
            const isRetweet = latestTweets[0].isRetweet;
            const url = `${baseUrl}${latestTweetLink}`;
            console.log('拼接后的推文url：', url);
            if (config.outputLogs) {
              logger.info('拼接后的推文url：', url);
            }

            // 获得推文具体内容
            const tpTweet = await getTimePushedTweet(ctx.puppeteer, url);
            if (config.outputLogs) {
              logger.info(`
                推文文字：${tpTweet.word_content}
                推文图片url:${tpTweet.imgUrls}
              `);
            }
            console.log(`
              推文文字：${tpTweet.word_content}
              推文图片url:${tpTweet.imgUrls}
            `);

            // 请求图片url
            const fullImgUrls = tpTweet.imgUrls.map(src => `${baseUrl}${src}`);
            const imagePromises = fullImgUrls.map(async (imageUrl) => {
              let attempts = 0;
              const maxRetries = 3;
              while (attempts < maxRetries) {
                try {
                  const response = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' });
                  return h.image(response, 'image/webp'); // 根据图片格式调整 MIME 类型
                } catch (error) {
                  attempts++;
                  logger.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                  console.error(`请求图片失败，正在尝试第 ${attempts} 次重试: ${imageUrl}`, error);
                  if (attempts >= maxRetries) {
                    logger.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                    console.error(`请求图片失败，已达最大重试次数: ${imageUrl}`, error);
                    return null;
                  }
                }
              }
            });
            const images = (await Promise.all(imagePromises)).filter((img) => img !== null); // 过滤掉请求失败的图片

            // 根据config决定是否翻译推文
            let tweetWord;
            if (config.whe_translate === true && config.apiKey){
              const translation = await translate(tpTweet.word_content , ctx, config);
              console.log('翻译结果',translation);
              tweetWord = translation;
            }else{
              tweetWord = tpTweet.word_content;
            }

            // 构造消息内容
            let msg = `${id} 发布了一条推文：\n${tweetWord}\n`;
            if (isRetweet) {
              msg += "[提醒：这是一条转发推文]\n";
            }
            msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
            msg += `${images.join('\n')}`;

            // 发送消息到指定群聊
            const botKey = `${config.platform}:${config.account}`;
            await ctx.bots[botKey].sendMessage(groupID, msg);
          } else {
            if (config.outputLogs) {
              logger.info(`已发送过博主 ${id} 的最新推文，跳过`);
            }
            console.log(`已发送过博主 ${id} 的最新推文，跳过`);
          }
        }
      } catch (error) {
        // 如果当前博主处理出错，记录日志并跳过当前博主
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

async function getScreenShot(pptr, url, maxRetries = 3) {// 获取指定帖子截图
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const page = await pptr.page();
      page.set
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
      await page.goto(url, { waitUntil: 'networkidle0' });
      // await page.reload({ waitUntil: 'networkidle0' }); // 刷新页面

      // 1、定位到元素
      const element = await page.$('div.css-175oi2r.r-1adg3ll');
      if (!element) {
        throw new Error('未能找到指定的元素');
      }
      // 2、移除遮挡的 div 元素
      await page.evaluate(() => {
        const overlayDiv = document.querySelector('div.css-175oi2r.r-l5o3uw.r-1upvrn0.r-yz1j6i');   
        const tiezi = document.querySelector('div.css-175oi2r.r-aqfbo4.r-gtdqiz.r-1gn8etr.r-1g40b8q');  
        if (overlayDiv) {overlayDiv.remove();}       
        if (tiezi) {tiezi.remove();}
      });
      const screenshotBuffer = await element.screenshot({ type: "webp" }); // 获取完整截图
      await page.close();
      return screenshotBuffer;
    } catch (error) {
      attempts++;
      console.error(`获取推文截图时出错，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= maxRetries) {
        console.error(`获取推文截图时出错，已达最大重试次数。`, error);
        return [];
      }
    }
  }
}

async function translate(text:string, ctx, config) { // 翻译推文
  const url = 'https://api.deepseek.com/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    const data = {
      model: 'deepseek-chat', // DeepSeek翻译模型
      messages: [
        { role: 'user', content: `请将以下内容翻译成中文: ${text}` },
      ],
      stream: false,
    };
    try {
      const response = await ctx.http.post(url, data, { headers });
      console.log('翻译结果：',response.choices[0].message.content);
      const translation = response.choices[0].message.content;
      return translation;
    } catch (err) {
      logger.error('翻译失败，请检查token余额，或者稍后再试：', err);
      return '翻译失败，请检查token余额，或者稍后再试。';
    }
}



      

    
    

 