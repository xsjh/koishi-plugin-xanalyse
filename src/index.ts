import { Context, Schema, h, Logger } from 'koishi'
import { } from "koishi-plugin-puppeteer";
import type { ChatLunaChatModel } from 'koishi-plugin-chatluna/lib/llm-core/platform/model'
import type { ComputedRef } from 'koishi-plugin-chatluna'

export const name = 'xanalyse'

export const logger = new Logger('xanalyse');

export const inject = { required: ["puppeteer", "database", "chatluna"] };

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
<p><b>📢注意：在填写完博主用户名后若初始化失败，请打开日志调试模式，手动点击生成的博主链接，查看是否正确引导至博主页面。若有误则可能因为博主id填写有误</b></p>
<hr>
<h2>⚠！重要告示！⚠</h2>
<p><b>本插件开发初衷是为了方便在群内看女声优推特，切勿用于订阅推送不合规、不健康内容，一切后果自负！</b></p>
<hr>
<h4>如果想继续开发优化本插件，<a href="https://github.com/xsjh/koishi-plugin-xanalyse/pulls" target="_blank">欢迎 PR</a></h4>
</body>
`;

const DEFAULT_PROMPT = '你是精通日语与互联网文化的推文翻译专家。请将输入内容翻译为简体中文，仅输出译文，不要附加解释。可适度润色，但需保留原文格式（换行、段落、标点）。保留网址、emoji、#话题标签原样，不翻译人名或其代称。正确理解常见缩写与梗语（如 rkgk = 落書き）。若内容为空、仅含链接、仅占位符或无有效文本，请不要翻译并直接输出空内容。请翻译：{text}';

export interface Config {
  account: string;
  platform: string;
  updateInterval: number;
  cookies: string;
  messagePrefix: string;
  fetchRetries: number;
  whe_translate?: boolean;
  model?: string;
  prompt?: string;
  translateRetries?: number;
  bloggers: Array<{
    id: string;
    groupID: string[];
    blacklist?: string[];
  }>;
  outputLogs?: boolean;
  detectXLinks?: boolean;
}

export const Config = Schema.intersect([
  Schema.object({
    account: Schema.string().required().description('机器人账号'),
    platform: Schema.string().required().description('机器人平台，例如onebot'),
    updateInterval: Schema.number().min(1).default(5).description('检查推文更新间隔时间（单位分钟），建议每多两个订阅增加1分钟'),
    cookies: Schema.string().required().description('x的登录cookies，获取方式往上翻看简介'),
    messagePrefix: Schema.string().default('获取了').description('推文消息前缀，例如"获取了"、"发布了"等'),
    fetchRetries: Schema.number().min(1).default(3).description('抓取推文失败时的重试次数')
  }).description('基础设置'),

  Schema.object({
    whe_translate: Schema.boolean().default(false).description('是否启用推文翻译（通过 ChatLuna 调用大模型）')
  }).description('翻译设置'),

  Schema.union([
    Schema.object({
      whe_translate: Schema.const(true).required(),
      model: Schema.dynamic('model').description('使用的的大语言模型名称 (需要通过 ChatLuna 先配置好)'),
      prompt: Schema.string().role('textarea').default(DEFAULT_PROMPT).description('翻译使用的提示词，使用{text}表示需要翻译的文本'),
      translateRetries: Schema.number().min(1).default(3).description('翻译接口失败时的重试次数')
    }),
    Schema.object({}),
  ]),

  Schema.object({
    bloggers: Schema.array(Schema.object({
      id: Schema.string().description('Twitter博主用户名, 输@之后的用户名即可，不要加上@'),
      groupID: Schema.array(String).role('table').description('需要推送的群号'),
      blacklist: Schema.array(Schema.string())
        .description('需要屏蔽的违禁词')
        .default([]),
    })).description('订阅的博主列表，例：elonmusk'),
  }).description('订阅的博主列表'),

  Schema.object({
    outputLogs: Schema.boolean().default(true).description('日志调试模式，开启以获得更多信息').experimental(),
    detectXLinks: Schema.boolean().default(true).description('是否启用 X/Twitter 链接检测，检测到时会根据 outputLogs 回复或记录日志')
  }).description('调试设置'),
]) as unknown as Schema<Config>;

//声明数据表
declare module 'koishi' {
  interface Tables {
    xanalyse: Xanalyse
  }
  interface Context {
    chatluna: any
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



export async function apply(ctx: Context, config: Config, session) {
  let chatLunaModel: ComputedRef<ChatLunaChatModel>;

  const loadModel = async () => {
    try {
      if (config.whe_translate && config.model) {
        chatLunaModel = await ctx.chatluna.createChatModel(config.model);
      }
    } catch (e) {
      logger.error('加载 ChatLuna 模型时出错：', e);
    }
  };

  const schemaPath = 'koishi-plugin-chatluna/utils/schema';
  const { modelSchema } = await import(schemaPath as any);
  modelSchema(ctx);
  ctx.on('ready', async () => {
    await loadModel();
  });

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
  ctx.setInterval(async () => { checkTweets(session, config, ctx, chatLunaModel) }, config.updateInterval * 60 * 1000);

  // 可复用的处理函数：根据 url 获取推文截图/翻译并通过 session 发送结果
  async function processTwitterUrl(sessionParam, urlParam) {
    try {
      const url = (urlParam || '').trim();
      if (!url) {
        await sessionParam.send("您输入的url为空");
        return;
      }
      await sessionParam.send("正在获取帖子截图...");
      logger.info("开始请求的推文连接：", url);
      const tpTweet = await getTimePushedTweet(ctx, ctx.puppeteer, url, config);
      // 如果未能拿到正文或截图，直接提示失败，避免返回 undefined
      if (!tpTweet || !tpTweet.screenshotBuffer) {
        const failMsg = "获取推文正文或截图失败，可能是接口限流或 cookies 失效，请稍后重试";
        if (config.outputLogs) {
          logger.error(failMsg, { url, tpTweet });
        }
        await sessionParam.send(failMsg);
        return;
      }
      const tweetText = tpTweet.word_content ?? '';
      const mediaUrls = tpTweet.mediaUrls || [];
      const isVideo = mediaUrls.some((u) => u.endsWith(".mp4"));
      // 构建 ALT 原文显示部分
      let altOriginalText = "";
      if (tpTweet.altTexts && tpTweet.altTexts.length > 0) {
        altOriginalText = "\n" + tpTweet.altTexts.map((alt, i) => `[图片${tpTweet.altTexts.length > 1 ? (i + 1) : ""}描述原文: ${alt}]`).join("\n");
      }
      // 根据config决定是否翻译推文
      let tweetWord;
      if (config.whe_translate === true && config.model) {
        try {
          const translation_result = await translate(tweetText, ctx, config, chatLunaModel);
          if (config.outputLogs) {
            logger.info("手动查询翻译结果：", translation_result);
          }
          tweetWord = translation_result;
        } catch (err) {
          logger.error("手动翻译失败，返回原文：", err);
          tweetWord = tweetText;
        }
      } else {
        tweetWord = tweetText;
      }
      // 根据是否为视频推文构造不同的消息结构
      if (isVideo) {
        // 视频推文：先发送文字+截图
        let textMsg = `${config.messagePrefix}一条视频推文：\n${tweetWord}${altOriginalText}\n`;
        textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
        // 只收集图片
        const imageUrls = mediaUrls.filter((u) => !u.endsWith('.mp4'));
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
        const videoUrl = mediaUrls.find((u) => u.endsWith('.mp4'));
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
              if (config.outputLogs) {
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
        await sessionParam.send(textMsg);
        if (video_response) {
          await sessionParam.send(h.video(video_response, 'video/mp4'));
        }
      } else {
        // 图片推文
        let msg = `${config.messagePrefix}一条图片推文：\n${tweetWord}${altOriginalText}\n`;
        msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
        if (mediaUrls.length > 0) {
          const imagePromises = mediaUrls.map(async (imageUrl) => {
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
        await sessionParam.send(msg);
      }
    } catch (error) {
      await sessionParam.send("获取推文内容失败");
      logger.info("获取推文截图过程失败", error);
    }
  }

  ctx.command('x [...arg]', '根据url获得推文信息')
    .action(async ({ session }, ...arg) => {
      const url = arg.join(' ').trim();
      await processTwitterUrl(session, url);
    });

  ctx.command('x/flash', '主动检查一次推文更新')
    .action(async ({ session }) => {
      await session.send("正在检查更新...");
      await checkTweets(session, config, ctx, chatLunaModel);
    });

  // X/Twitter 链接识别：提取消息中的 URL，识别 x/twitter 域名，并尝试展开 t.co 短链。
  const _urlRe = /((https?:\/\/)?[^\s'"\)]+\.[^\s'"\)]+)/g;
  const extractUrls = (text: string) => {
    const matches = text.match(_urlRe) || [];
    return matches.map((m) => m.replace(/[\u3002\uFF0C\uFF1F\uFF01\.,!?，。？！、]+$/g, ""));
  };

  const isXDomain = (urlStr: string) => {
    try {
      const u = new URL(urlStr.includes('://') ? urlStr : 'https://' + urlStr);
      const hn = (u.hostname || "").toLowerCase();
      return hn === 't.co' || hn === 'x.com' || hn.endsWith('.x.com') || hn.endsWith('.twitter.com') || hn === 'twitter.com' || hn === 'm.twitter.com' || hn === 'mobile.twitter.com';
    } catch (e) {
      return false;
    }
  };

  const expandShortLink = async (url: string) => {
    try {
      // 尝试用不跟随重定向的请求获取 Location
      const res = await ctx.http.get(url, { redirect: 'manual' } as any);
      return (res && res.headers && res.headers.location) || url;
    } catch (err: any) {
      try {
        // axios 在 3xx 时会抛错，错误对象中可能包含 response.headers.location
        if (err && err.response && err.response.headers && err.response.headers.location) {
          return err.response.headers.location;
        }
      } catch (__) { }
      return url;
    }
  };

  // 中间件：在每条会话内容中检测 X/Twitter 链接
  ctx.middleware(async (session2, next) => {
    try {
      if (!config || config.detectXLinks === false) return next();
      const text = session2.content || '';
      if (!text) return next();
      const candidates = extractUrls(text);
      if (!candidates.length) return next();
      const found: string[] = [];
      for (const c of candidates) {
        const normalized = c.startsWith('http') ? c : 'https://' + c;
        if (/^https?:\/\/t\.co\//i.test(normalized)) {
          const exp = await expandShortLink(normalized);
          if (isXDomain(exp)) found.push(exp);
        } else if (isXDomain(normalized)) {
          found.push(normalized);
        }
      }
      if (found.length) {
        logger.info('检测到 X/Twitter 链接:', found);
        // 对检测到的链接执行与命令相同的处理流程
        for (const link of found) {
          try {
            await processTwitterUrl(session2, link);
          } catch (e) {
            logger.error('处理检测到的 X/Twitter 链接时出错', e);
          }
        }
      }
    } catch (err) {
      logger.error('X/Twitter 链接检测失败', err);
    }
    return next();
  });
}

async function getTimePushedTweet(ctx, pptr, url, config, maxRetries?: number) { // 获取需要推送的推文具体内容
  const retryLimit = Math.max(1, Number.isFinite(maxRetries) ? maxRetries : (config.fetchRetries ?? 3));
  let page;
  let attempts = 0;
  while (attempts < retryLimit) {
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
      // Try to wait until images inside the article are complete, then
      // compute a tight union bbox between the article and a detected avatar image
      // to avoid expanding too far left (which may include page chrome/sidebar).
      let screenshotBuffer;
      try {
        try {
          // wait up to 8s for imgs inside the article to finish loading
          await page.waitForFunction((sel) => {
            const a = document.querySelector(sel);
            if (!a) return false;
            const imgs = Array.from(a.querySelectorAll('img')) as HTMLImageElement[];
            return imgs.every((img) => img.complete && img.naturalWidth > 0);
          }, { timeout: 8000 }, 'article[data-testid="tweet"]');
        } catch (__) {
          // proceed even if timeout — we'll still try to capture
        }
        const box = await element.boundingBox();
        if (box) {
          // detect a likely avatar inside the article by finding a small image near the top
          const imgs = await element.$$('img');
          let avatarBox = null;
          for (const img of imgs) {
            try {
              const ibox = await img.boundingBox();
              if (!ibox) continue;
              const relTop = ibox.y - box.y;
              // small width and near the top of the article -> likely avatar
              if (ibox.width <= 96 && relTop >= 0 && relTop <= 96) {
                avatarBox = ibox;
                break;
              }
            } catch (__) {
            }
          }
          // union bbox
          let leftMost = box.x;
          let topMost = box.y;
          let rightMost = box.x + box.width;
          let bottomMost = box.y + box.height;
          if (avatarBox) {
            leftMost = Math.min(leftMost, avatarBox.x);
            topMost = Math.min(topMost, avatarBox.y);
            rightMost = Math.max(rightMost, avatarBox.x + avatarBox.width);
            bottomMost = Math.max(bottomMost, avatarBox.y + avatarBox.height);
          }
          const pad = 12;
          const x = Math.max(0, Math.floor(leftMost - pad));
          const y = Math.max(0, Math.floor(topMost - pad));
          const width = Math.ceil(rightMost - leftMost + pad * 2);
          const height = Math.ceil(bottomMost - topMost + pad * 2);
          screenshotBuffer = await page.screenshot({ clip: { x, y, width, height }, type: "webp" });
        } else {
          screenshotBuffer = await element.screenshot({ type: "webp" });
        }
      } catch (e) {
        // fallback to element screenshot on any error
        screenshotBuffer = await element.screenshot({ type: "webp" });
      }

      if (isProtected) {
        // 受保护账号：只获取文字和截图，不返回媒体
        const word_content = await page.evaluate(() => {
          const el = document.querySelector('div[data-testid="tweetText"]');
          return el ? el.textContent.trim() : '';
        });
        const element2 = await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
        let screenshotBuffer2 = null;
        if (element2) {
          try {
            try {
              await page.waitForFunction((sel) => {
                const a = document.querySelector(sel);
                if (!a) return false;
                const imgs = Array.from(a.querySelectorAll('img')) as HTMLImageElement[];
                return imgs.every((img) => img.complete && img.naturalWidth > 0);
              }, { timeout: 8000 }, 'article[data-testid="tweet"]');
            } catch (__) {
            }
            const box2 = await element2.boundingBox();
            if (box2) {
              const imgs2 = await element2.$$('img');
              let avatarBox2 = null;
              for (const img of imgs2) {
                try {
                  const ibox = await img.boundingBox();
                  if (!ibox) continue;
                  const relTop = ibox.y - box2.y;
                  if (ibox.width <= 96 && relTop >= 0 && relTop <= 96) {
                    avatarBox2 = ibox;
                    break;
                  }
                } catch (__) {
                }
              }
              let leftMost2 = box2.x;
              let topMost2 = box2.y;
              let rightMost2 = box2.x + box2.width;
              let bottomMost2 = box2.y + box2.height;
              if (avatarBox2) {
                leftMost2 = Math.min(leftMost2, avatarBox2.x);
                topMost2 = Math.min(topMost2, avatarBox2.y);
                rightMost2 = Math.max(rightMost2, avatarBox2.x + avatarBox2.width);
                bottomMost2 = Math.max(bottomMost2, avatarBox2.y + avatarBox2.height);
              }
              const pad2 = 12;
              const x2 = Math.max(0, Math.floor(leftMost2 - pad2));
              const y2 = Math.max(0, Math.floor(topMost2 - pad2));
              const width2 = Math.ceil(rightMost2 - leftMost2 + pad2 * 2);
              const height2 = Math.ceil(bottomMost2 - topMost2 + pad2 * 2);
              screenshotBuffer2 = await page.screenshot({ clip: { x: x2, y: y2, width: width2, height: height2 }, type: "webp" });
            } else {
              screenshotBuffer2 = await element2.screenshot({ type: "webp" });
            }
          } catch (err) {
            screenshotBuffer2 = await element2.screenshot({ type: "webp" });
          }
        }
        return {
          word_content: `${word_content}\n（注：此账号为受保护账号，故不提供具体媒体内容）`,
          mediaUrls: [],
          screenshotBuffer: screenshotBuffer2
        };
      } else {
        // 请求 vxtwitter API
        const apiUrl = url.replace(/(twitter\.com|x\.com)/, 'api.vxtwitter.com');
        console.log('请求 API URL:', apiUrl);
        let apiAttempts = 0;
        while (apiAttempts < retryLimit) {
          try {
            const apiResponse = await ctx.http.get(apiUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            console.log('成功接收到 vxtwitter API 的响应:', apiResponse);
            // 提取图片的 ALT 文本（原始未翻译）
            let altTexts: string[] = [];
            if (apiResponse.media_extended && apiResponse.media_extended.length > 0) {
              altTexts = apiResponse.media_extended
                .filter((m) => m.altText && m.altText.trim())
                .map((m) => m.altText.trim());
            }
            // 将 ALT 文本拼接到正文用于翻译
            let wordContentForTranslation = apiResponse.text || "";
            if (altTexts.length > 0) {
              wordContentForTranslation += "\n\n" + altTexts.map((alt, i) => `[图片${altTexts.length > 1 ? (i + 1) : ""}描述: ${alt}]`).join("\n");
            }
            return {
              word_content: wordContentForTranslation,
              altTexts: altTexts,  // 保留原始ALT文本用于显示原文
              mediaUrls: apiResponse.media_extended ? apiResponse.media_extended.map(m => m.url) : [],
              screenshotBuffer
            };
          } catch (err) {
            apiAttempts++;
            logger.error(`请求 vxtwitter API 失败，正在尝试第 ${apiAttempts} 次重试...`, err);
            if (apiAttempts >= retryLimit) {
              // 如果API请求失败，返回空结果
              return {
                word_content: '',
                mediaUrls: [],
                screenshotBuffer
              };
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * apiAttempts));
          }
        }
      }
    } catch (error) {
      attempts++;
      logger.error(`获取推文内容失败，正在尝试第 ${attempts} 次重试...`, error);
      if (attempts >= retryLimit) {
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
      if (page) await page.close().catch(() => { });
    }
  }
}

async function getLatestTweets(pptr, url, config, maxRetries?: number): Promise<LatestResult> {// 获得订阅博主最新推文url和判重内容
  const retryLimit = Math.max(1, Number.isFinite(maxRetries) ? maxRetries : (config.fetchRetries ?? 3));
  let page;
  let attempts = 0;
  while (attempts < retryLimit) {
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
      if (attempts >= retryLimit) {
        logger.error('测试抓取失败，已达最大重试次数。', error);
        return { tweets: [], word_content: '' };
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
    } finally {
      if (page) await page.close().catch(() => { });
    }
  }
}

async function checkTweets(session, config, ctx, chatLunaModel?: ComputedRef<ChatLunaChatModel>) { // 更新一次推文
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
          // 获取具体内容
          const tpTweet = await getTimePushedTweet(ctx, ctx.puppeteer, latestTweetLink, config);
          if (!tpTweet || !tpTweet.screenshotBuffer) {
            logger.error(`获取推文内容失败，跳过推送并等待下次重试。链接：${latestTweetLink}`);
            continue;
          }
          const tweetText = tpTweet.word_content ?? '';
          const mediaUrls = tpTweet.mediaUrls || [];
          await ctx.database.upsert('xanalyse', [
            { id, link: latestTweetLink, content: latestTweetcontent },
          ]);
          if (config.outputLogs) {
            logger.info(`推文文字：${tweetText}`);
            logger.info('推文媒体url:', mediaUrls.map(url => url).join(', '));
          }
          const isRetweet = result.tweets[0].isRetweet;
          // 判断是否为视频推文：如果 mediaUrls 中包含 .mp4 则为 true
          const isVideo = mediaUrls.some(url => url.endsWith('.mp4'));
          // 根据config决定是否翻译推文
          let tweetWord;
          if (config.whe_translate === true && config.model) {
            const translation = await translate(tweetText, ctx, config, chatLunaModel);
            console.log('翻译结果', translation);
            tweetWord = translation;
          } else {
            tweetWord = tweetText;
          }

          // 判断是否命中违禁词
          if (blogger.blacklist && blogger.blacklist.length > 0) {
            const lowerTweet = tweetWord.toLowerCase();
            const lowerOriginal = tweetText.toLowerCase();
            const hitWords = blogger.blacklist.filter(word => {
              const lowerWord = word.toLowerCase();
              return lowerTweet.includes(lowerWord) || lowerOriginal.includes(lowerWord);
            });
            if (hitWords.length > 0) {
              logger.info(`推文包含违禁词：${hitWords.join(', ')}，跳过推送`);
              continue;
            }
          }

          // 准备botkey
          const botKey = `${config.platform}:${config.account}`;
          // 构建 ALT 原文显示部分
          let altOriginalText = "";
          if (tpTweet.altTexts && tpTweet.altTexts.length > 0) {
            altOriginalText = "\n" + tpTweet.altTexts.map((alt, i) => `[图片${tpTweet.altTexts.length > 1 ? (i + 1) : ""}描述原文: ${alt}]`).join("\n");
          }

          // 根据是否为视频推文构造不同的消息结构
          if (isVideo) {
            // 视频推文：先发送文字+截图
            let textMsg = `【${id}】 ${config.messagePrefix}一条视频推文：\n${tweetWord}${altOriginalText}\n`;
            if (isRetweet) {
              textMsg += "[提醒：这是一条转发推文]\n";
            }
            textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
            // 收集图片
            const imageUrls = mediaUrls.filter(url => !url.endsWith('.mp4'));
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
            const videoUrl = mediaUrls.find(url => url.endsWith('.mp4'));
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
                  if (config.outputLogs) {
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
            let msg = `【${id}】 ${config.messagePrefix}一条图片推文：\n${tweetWord}${altOriginalText}\n`;
            if (isRetweet) {
              msg += "[提醒：这是一条转发推文]\n";
            }
            msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
            if (mediaUrls.length > 0) {
              const imagePromises = mediaUrls.map(async (imageUrl) => {
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
        } else {
          if (config.outputLogs) {
            logger.info(`已发送过博主 ${id} 的最新推文，跳过`);
          }
        }
      } catch (error) {
        logger.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl}`, error);
        console.error(`加载博主 ${id} 的页面时出错，URL: ${bloggerUrl}`, error);
        if (session?.send) {
          await session.send(`加载博主 ${id} 的页面时出错，可能是网络问题或链接不合法。请检查链接的合法性或稍后重试。`);
        }
      }
    }
  } catch (error) {
    logger.error('主函数错误：', error);
    console.error('主函数错误：', error);
    if (session?.send) {
      await session.send('获取推文时出错，请检查网页链接的合法性或稍后重试。');
    }
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
        const { tweets, word_content } = await getLatestTweets(ctx.puppeteer, bloggerUrl, config);
        if (config.outputLogs) {
          logger.info('[初始化]主函数返回的推文信息：', tweets[0].link, word_content);
        }
        // 检查url是否获取成功
        if (tweets.length > 0) {
          await ctx.database.upsert('xanalyse', [
            { id, link: tweets[0].link, content: word_content }
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

async function translate(text: string, ctx, config, chatLunaModel?: ComputedRef<ChatLunaChatModel>) { // 翻译推文
  const { HumanMessage } = await import('@langchain/core/messages');
  const promptTemplate = (config.prompt && config.prompt.trim()) ? config.prompt : DEFAULT_PROMPT;
  const retryLimit = Math.max(1, config.translateRetries ?? 3);
  let attempts = 0;
  while (attempts < retryLimit) {
    try {
      if (!chatLunaModel || !chatLunaModel.value) {
        throw new Error('ChatLuna 聊天模型未加载完成或不可用');
      }
      const response = await chatLunaModel.value.invoke([
        new HumanMessage(promptTemplate.replace('{text}', text))
      ]);
      if (config.outputLogs) {
        logger.info('翻译api返回结果：', response);
      }
      if (response && response.content) {
        const translation = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
        console.log('翻译结果：', translation);
        return translation;
      } else {
        throw new Error('模型未返回任何内容');
      }
    } catch (err) {
      attempts++;
      logger.error(`翻译失败，正在尝试第 ${attempts} 次重试...`, err);
      if (attempts >= retryLimit) {
        logger.error('翻译失败，请检查 ChatLuna 配置是否正确：', err);
        return '翻译失败，请检查 ChatLuna 配置是否正确';
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
}
