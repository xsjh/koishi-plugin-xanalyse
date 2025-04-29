import {Context, Schema, h} from 'koishi'
import Puppeteer, {} from "koishi-plugin-puppeteer";

export const name = 'xanalyse'

export const inject = {required:["puppeteer"]};

export const usage = `
<p>全程需攠fa🎇，并要在proxy-agent内配置代理</p>
`;

export interface Config {
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    account: Schema.string().description('机器人账号'),
    platform: Schema.string().description('机器人平台'),
  }).description('基础设置'),
  Schema.object({
    bloggers: Schema.array(Schema.object({
      id: Schema.string().description('Twitter 博主 ID'),
      groupID: Schema.string().description('需要推送的群号'),    
    })).description('订阅的博主列表'),
  }).description('订阅的博主列表'),
]);

export function apply(ctx: Context, config) {
  // 初始化数组，用于存储每个博主的最新推文链接
  let sentTweetUrls: { id: string; link: string | null }[] = config.bloggers.map(blogger => ({
    id: blogger.id,
    link: null
  }));

  async function checkTweets(session) {
    try {
      // 遍历博主id并挨个请求最新推文url
      const baseUrl = 'https://nitter.net'; // 替换为实际的 Nitter 镜像站地址
      for (const blogger of config.bloggers) {
        const { id, groupID } = blogger;
        const bloggerUrl = `${baseUrl}/${id}`;
        console.log('本次请求的博主与链接：', id, bloggerUrl);

        try {
          const latestTweets = await getLatestTweets(ctx.puppeteer, bloggerUrl);
          console.log('主函数返回的推文信息：', latestTweets);

          // 检查url是否获取成功
          if (latestTweets.length > 0) {
            const latestTweetLink = latestTweets[0].link;
            // 检查是否已经发送过该推文
            console.log('当前已存储推文历史：', sentTweetUrls);
            const existingTweet = sentTweetUrls.find(item => item.id === id);
            if (existingTweet && existingTweet.link !== latestTweetLink) { // 未发送的情况
              existingTweet.link = latestTweetLink;
              const isRetweet = latestTweets[0].isRetweet;
              const url = `${baseUrl}${latestTweetLink}`;
              console.log('拼接后的推文url：', url);

              // 获得推文具体内容
              const tpTweet = await getTimePushedTweet(ctx.puppeteer, url);
              console.log(`
              推文文字：${tpTweet.word_content}
              推文图片url:${tpTweet.imgUrls}
                `);

              // 请求图片url
              const fullImgUrls = tpTweet.imgUrls.map(src => `${baseUrl}${src}`);
              const imagePromises = fullImgUrls.map(async (imageUrl) => {
                try {
                  const response = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' });
                  return h.image(response, 'image/webp'); // 根据图片格式调整 MIME 类型
                } catch (error) {
                  console.error(`请求图片失败: ${imageUrl}`, error);
                  return null;
                }
              });
              const images = (await Promise.all(imagePromises)).filter((img) => img !== null); // 过滤掉请求失败的

              // 构造消息内容
              let msg = `${id} 发布了一条推文：\n${tpTweet.word_content}\n`;
              if (isRetweet) {
                msg += "[提醒：这是一条转发推文]\n";
              }
              msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
              msg += `${images.join('\n')}`;

              // 发送消息到指定群聊
              const botKey = `${config.platform}:${config.account}`;
              await ctx.bots[botKey].sendMessage(groupID, msg);
            } else {
              console.log(`已发送过博主 ${id} 的最新推文，跳过`);
            }
          }
        } catch (error) {
          console.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl}`, error);
          await session.send(`加载博主 ${id} 的页面时出错，可能是网络问题或链接不合法。请检查链接的合法性或稍后重试。`);
        }
      }
    } catch (error) {
      console.error('主函数错误：', error);
      await session.send('获取推文时出错，请检查网页链接的合法性或稍后重试。');
    }
  }

  setInterval(checkTweets, 5 * 60 * 1000);

  ctx.command('tt')
    .action(async ({ session }) => {
    });

  ctx.command('twitter [...arg]', '根据url获得twitter推文内容')
    .action(async ({session}, ...arg) => {
      try {
        const url = arg.join(' ').trim();
        if (url == ''){
        await session.send("您输入的url为空");
      }else{
        // 判断x链接并前往nitter获取内容
      }
      } catch (error) {
        console.log("获取推文过程失败", error);
      }
    });
}

async function getTimePushedTweet(pptr, url) {// 根据推文链接获取内容
  try {
    const page = await pptr.page();// 初始化浏览器
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
    await page.goto(url, { waitUntil: 'networkidle0' });

    // 1、定位到元素
    const element = await page.$('div.timeline-item ');
    if (!element) {
      throw new Error('未能找到指定的元素');
    }
    // 2、获取推文文字内容
    const word_content = await page.evaluate(() => {
      const txt_element = document.querySelector('div.tweet-content.media-body');
      if (!txt_element){
        console.error('未获取推文文字内容');
      }
      let textContent = txt_element.textContent || '';
      return textContent.trim();});
    // 3、获取推文完整截图
    const screenshotBuffer = await element.screenshot({ type: "webp" });// 获取完整截图
    // 4、获取推文图片
    const imgUrls = await page.evaluate(() => {
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
    return {
      word_content,
      imgUrls,
      screenshotBuffer
    }
  } catch (error) {
    console.log("获取定时推送推文错误", error);
  }
}

async function getLatestTweets(pptr, url) {// 获得最新推文链接
  try {
    const page = await pptr.page();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
    await page.goto(url, { waitUntil: 'networkidle0' });

    const tweets = await page.evaluate(async () => {
      const timelineItems = document.querySelectorAll('div.timeline-item');
      console.log('timelineitems_all:', timelineItems);
      const tweetLinks = [];

      for (const item of timelineItems) {
        const pinned = item.querySelector('div.pinned');
        if (pinned) continue; // 跳过置顶推文

        const retweetHeader = item.querySelector('div.retweet-header');
        const isRetweet = retweetHeader ? true : false; // 检查是否为转发推文

        const tweetLink = item.querySelector('a.tweet-link');
        console.log('本次获取的tweetLink:', tweetLink);
        if (tweetLink) {
          tweetLinks.push({
            link: tweetLink.getAttribute('href'),
            isRetweet: isRetweet, // 添加转发标志
          });
          console.log('存储的tweetLinks', tweetLinks)
        }
      }
      return tweetLinks.slice(0, 1); // 获取前两条推文
    });
    // console.log('本次返回的推文内容', tweets);
    return tweets;
  } catch (error) {
    console.error(`获取博主 ${url} 的推文时出错:`, error);
    return [];
  }
}



      
      

      

    
    

 