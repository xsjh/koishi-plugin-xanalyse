import { Context, Schema, h, Logger } from 'koishi'
import { } from "koishi-plugin-puppeteer";

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
<p> · 当启用时，插件会在收到含有 <code>x.com</code>、<code>twitter.com</code> 或短链 <code>t.co</code> 的消息时进行识别并尝试展开短链；若 <code>outputLogs</code> 为 <code>true</code>，插件还会在会话中发送一条简短提示（否则仅写入日志）。</p>
<p> · 若聊天中链接较多或担心性能影响，可将 <code>detectXLinks</code> 设为 <code>false</code> 以关闭该检测。</p>
</ul>

<p><b>再次提醒：全程需✨🧙‍♂️，请在proxy-agent内配置代理</b></p>
<hr>
<div class="version">
<h3>Version</h3>
<p>版本更新记录请参考顶部“插件主页”。</p>
</div>
<hr>
<h2>⚠！重要告示！⚠</h2>
<p><b>本插件开发初衷是为了方便在群内看女声优推特，切勿用于订阅推送不合规、不健康内容，一切后果自负！</b></p>
<hr>
<h4>如果想继续开发优化本插件，<a href="https://github.com/xsjh/koishi-plugin-xanalyse/pulls" target="_blank">欢迎 PR</a></h4>
</body>
`;

const DEFAULT_PROMPT = '你是精通日语与互联网文化的推文翻译专家。请将输入内容翻译为简体中文，仅输出译文，不要附加解释。可适度润色，但需保留原文格式（换行、段落、标点）。保留网址、emoji、#话题标签原样，不翻译人名或其代称。正确理解常见缩写与梗语（如 rkgk = 落書き）。若内容为空、仅含链接、仅占位符或无有效文本，请不要翻译并直接输出空内容。请翻译：{text}';
const IMAGE_TRANSLATION_PROMPT_APPEND = [
  '以下为补充强约束（优先于上文输出格式要求）：',
  '你还会收到推文配图，请额外完成图片文字识别与翻译任务。',
  '要求：',
  '1. 按输入图片顺序输出每张图的“译文”和“原文”（先译文，后原文）。',
  '2. 原文尽量保留识别到的原语言文本与行序；译文翻译为简体中文。',
  '3. 若某张图片无可识别文字，则该图不输出任何条目。',
  '4. 若本批全部图片都无可识别文字，则返回空字符串（不要输出任何文字）。',
  '5. 仅输出以下结构，不要附加额外解释：',
  '图片1译文：...',
  '图片1原文：...',
  '图片2译文：...',
  '图片2原文：...'
].join('\n');

const ALT_TRANSLATION_PROMPT_APPEND = [
  '以下为补充强约束（优先于上文输出格式要求）：',
  '下面是推文图片 ALT 文本列表，请逐条翻译。',
  '要求：',
  '1. 仅输出翻译结果，按原编号顺序。',
  '2. 格式为“ALT1译文：...”。',
  '3. 无法翻译时保留原文。'
].join('\n');
const REQUEST_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const BASE_SCREENSHOT_VIEWPORT = { width: 1280, height: 2200 };
const SCREENSHOT_STABILITY_STYLE_ID = '__xanalyse_screenshot_stability_style__';
const SCREENSHOT_OVERLAY_MARK_ATTR = 'data-xanalyse-hide-overlay';
const SCREENSHOT_STABILITY_CSS = [
  `[${SCREENSHOT_OVERLAY_MARK_ATTR}="1"] { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`,
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  'html { scroll-behavior: auto !important; }',
].join('\n');

export interface Config {
  account: string;
  platform: string;
  updateInterval: number;
  cookies: string;
  messagePrefix: string;
  fetchRetries: number;
  screenshotExtraWaitMs?: number;
  screenshotHighQualityMode?: boolean;
  whe_translate?: boolean;
  apiKey?: string;
  apiurl?: string;
  model?: string;
  prompt?: string;
  translateRetries?: number;
  translationBilingual?: boolean;
  llmImageInputEnabled?: boolean;
  llmImageInputLimit?: number;
  llmImageInputSizeLimitKB?: number;
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
    fetchRetries: Schema.number().min(1).default(3).description('抓取推文失败时的重试次数'),
    screenshotExtraWaitMs: Schema.number().min(0).max(15000).default(1200).description('截图前额外等待时间（毫秒）：在页面就绪后再等待一段时间，降低图片未加载完整的概率'),
    screenshotHighQualityMode: Schema.boolean().default(false).description('高质量模式：开启后截图使用 deviceScaleFactor=2（更清晰但更耗时）')
  }).description('基础设置'),

  Schema.object({
    whe_translate: Schema.boolean().default(false).description('是否启用推文翻译'),
    translationBilingual: Schema.boolean().default(true).description('翻译结果显示模式：开启为双语（译文+原文），关闭为仅译文'),
    llmImageInputEnabled: Schema.boolean().default(false).description('LLM输入图片支持：开启后将推文图片一并送入LLM翻译'),
    llmImageInputLimit: Schema.number().min(1).max(10).default(2).description('LLM输入图片数量限制：单次请求最多附带图片张数（超出后分批）'),
    llmImageInputSizeLimitKB: Schema.number().min(64).default(1024).description('LLM输入图片尺寸限制（KB）：超出后将先压缩再发送')
  }).description('翻译设置'),

  Schema.union([
    Schema.object({
      whe_translate: Schema.const(true).required(),
      apiKey: Schema.string().required().description('翻译服务 API Key'),
      apiurl: Schema.string().default('https://api.deepseek.com').description('翻译服务 API 地址（支持 OpenAI 兼容格式）'),
      model: Schema.string().default('deepseek-chat').description('翻译模型名称（根据所用服务填写）'),
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
]) as Schema<Config>;

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

interface TweetDetailResult {
  word_content: string;
  altTexts: string[];
  mediaUrls: string[];
  screenshotBuffer: Buffer | null;
}

interface TweetTranslationBundle {
  textOriginal: string;
  textTranslated: string;
  altOriginalList: string[];
  altTranslated: string;
  imageOriginal: string;
  imageTranslated: string;
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
      const altTexts = tpTweet.altTexts || [];
      const mediaBufferCache = new Map<string, Buffer>();
      const isVideo = mediaUrls.some((u) => u.endsWith(".mp4"));
      const translationBundle = await buildTweetTranslationBundle({
        textOriginal: tweetText,
        altOriginalList: altTexts,
        mediaUrls,
        mediaBufferCache,
        ctx,
        config,
      });
      // 根据是否为视频推文构造不同的消息结构
      if (isVideo) {
        // 视频推文：先发送文字+截图
        let textMsg = buildTweetIntroMessage({
          messagePrefix: config.messagePrefix,
          isVideo: true,
          bundle: translationBundle,
          isRetweet: false,
          showTranslationSections: isTranslateEnabled(config),
          bilingualOutput: isBilingualOutput(config),
        });
        textMsg += "\n";
        textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
        // 只收集图片
        const imageUrls = mediaUrls.filter((u) => !u.endsWith('.mp4'));
        if (imageUrls.length > 0) {
          const images = await buildImageElementsFromUrls(ctx, imageUrls, config, mediaBufferCache);
          textMsg += `${images.join('\n')}`;
        }
        // 只发送第一个 mp4 视频
        const videoUrl = mediaUrls.find((u) => u.endsWith('.mp4'));
        let video_response: Buffer | null = null;
        if (videoUrl) {
          video_response = await fetchBinaryWithRetry(ctx, videoUrl, config, 3, '视频');
          if (video_response && config.outputLogs) {
            logger.info(`成功请求视频文件: ${videoUrl}`);
          }
        }
        await sessionParam.send(textMsg);
        if (video_response) {
          await sessionParam.send(h.video(video_response, 'video/mp4'));
        }
      } else {
        // 图片推文
        let msg = buildTweetIntroMessage({
          messagePrefix: config.messagePrefix,
          isVideo: false,
          bundle: translationBundle,
          isRetweet: false,
          showTranslationSections: isTranslateEnabled(config),
          bilingualOutput: isBilingualOutput(config),
        });
        msg += "\n";
        msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
        if (mediaUrls.length > 0) {
          const images = await buildImageElementsFromUrls(ctx, mediaUrls, config, mediaBufferCache);
          msg += `${images.join('\n')}`;
        }
        await sessionParam.send(msg);
      }
    } catch (error) {
      await sessionParam.send("获取推文内容失败");
      logger.info("获取推文截图过程失败", error);
    }
  }

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
      const url = arg.join(' ').trim();
      await processTwitterUrl(session, url);
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
      if (isManualTwitterCommandMessage(text)) return next();
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
      const uniqueFound = Array.from(new Set(found));
      if (uniqueFound.length) {
        logger.info('检测到 X/Twitter 链接:', uniqueFound);
        // 对检测到的链接执行与命令相同的处理流程
        for (const link of uniqueFound) {
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

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: any;
}

interface BuildTranslationBundleParams {
  textOriginal: string;
  altOriginalList: string[];
  mediaUrls: string[];
  mediaBufferCache?: Map<string, Buffer>;
  ctx: Context;
  config: Config;
}

interface BuildIntroMessageParams {
  heading?: string;
  messagePrefix: string;
  isVideo: boolean;
  bundle: TweetTranslationBundle;
  isRetweet?: boolean;
  showTranslationSections: boolean;
  bilingualOutput: boolean;
}

interface PreparedImageForLLM {
  index: number;
  sourceUrl: string;
  originalBytes: number;
  finalBytes: number;
  dataUrl: string;
}

interface ImageTranslationResult {
  translated: string;
  original: string;
  raw: string;
}

function isTranslateEnabled(config: Config): boolean {
  return config?.whe_translate === true && !!config?.apiKey;
}

function isBilingualOutput(config: Config): boolean {
  return config?.translationBilingual !== false;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getScreenshotExtraWaitMs(config: Config): number {
  const raw = Number(config?.screenshotExtraWaitMs ?? 1200);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

async function waitBeforeScreenshot(config: Config, scene: string) {
  const extraWaitMs = getScreenshotExtraWaitMs(config);
  if (extraWaitMs <= 0) return;
  if (config.outputLogs) {
    logger.info(`[截图等待] ${scene}，额外等待 ${extraWaitMs}ms`);
  }
  await sleep(extraWaitMs);
}

function getScreenshotViewport(config: Config) {
  const deviceScaleFactor = config?.screenshotHighQualityMode ? 2 : 1;
  return {
    ...BASE_SCREENSHOT_VIEWPORT,
    deviceScaleFactor,
  };
}

async function applyStableScreenshotViewport(page: any, config: Config) {
  const viewport = getScreenshotViewport(config);
  await page.setViewport(viewport);
  if (config.outputLogs) {
    logger.info('[截图参数] 使用固定 viewport', viewport);
  }
}

async function waitForTweetImagesLoaded(page: any, selector: string) {
  await page.waitForFunction((sel) => {
    const root = document.querySelector(sel);
    if (!root) return false;
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    return imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 8000 }, selector);
}

async function waitForStableElementBox(element: any, samples = 6, intervalMs = 120) {
  let lastBox: any = null;
  let stableCount = 0;
  for (let i = 0; i < samples; i++) {
    const box = await element.boundingBox();
    if (box && box.width > 40 && box.height > 40) {
      if (
        lastBox &&
        Math.abs(box.x - lastBox.x) < 1 &&
        Math.abs(box.y - lastBox.y) < 1 &&
        Math.abs(box.width - lastBox.width) < 1 &&
        Math.abs(box.height - lastBox.height) < 1
      ) {
        stableCount += 1;
        if (stableCount >= 2) return box;
      } else {
        stableCount = 0;
      }
      lastBox = box;
    }
    await sleep(intervalMs);
  }
  return lastBox;
}

function clampClipToViewport(box: any, viewport: any, pad = 12) {
  if (!box || !viewport) return null;
  const left = Math.max(0, Math.floor(box.x - pad));
  const top = Math.max(0, Math.floor(box.y - pad));
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width + pad));
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height + pad));
  const width = right - left;
  const height = bottom - top;
  if (width <= 1 || height <= 1) return null;
  return { x: left, y: top, width, height };
}

async function installScreenshotVisualGuards(page: any, config: Config): Promise<() => Promise<void>> {
  try {
    await page.evaluate((tweetSelector, styleId, markAttr, cssText) => {
      const prevMarked = Array.from(document.querySelectorAll(`[${markAttr}]`));
      for (const node of prevMarked) {
        node.removeAttribute(markAttr);
      }

      const tweet = document.querySelector(tweetSelector);
      const candidates = Array.from(document.querySelectorAll('body *'));
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue;
        if (!node.isConnected) continue;
        if (tweet && (node === tweet || node.contains(tweet) || tweet.contains(node))) continue;

        const role = (node.getAttribute('role') || '').toLowerCase();
        const ariaModal = (node.getAttribute('aria-modal') || '').toLowerCase();
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        const className = typeof node.className === 'string' ? node.className.toLowerCase() : '';
        const computed = window.getComputedStyle(node);
        const position = computed.position;
        const zIndex = Number.parseInt(computed.zIndex || '0', 10);
        const rect = node.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);

        const isFloating = (position === 'fixed' || position === 'sticky') && area >= 1600;
        const isDialogLike = ariaModal === 'true' || role === 'dialog' || role === 'alertdialog';
        const isTransientLayer = testId.includes('modal')
          || testId.includes('sheetdialog')
          || testId.includes('hovercard')
          || testId.includes('toast');
        const isHighZFloating = isFloating && Number.isFinite(zIndex) && zIndex >= 1000;
        const isFloatingSkeleton = isFloating && (className.includes('skeleton') || className.includes('shimmer') || className.includes('loading'));

        if (isDialogLike || isTransientLayer || isHighZFloating || isFloatingSkeleton) {
          node.setAttribute(markAttr, '1');
        }
      }

      let style = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = cssText;
    }, TWEET_ARTICLE_SELECTOR, SCREENSHOT_STABILITY_STYLE_ID, SCREENSHOT_OVERLAY_MARK_ATTR, SCREENSHOT_STABILITY_CSS);
    if (config.outputLogs) {
      logger.info('[截图流程] 已启用浮层隐藏与动画冻结');
    }
  } catch (err) {
    if (config.outputLogs) {
      logger.warn('[截图流程] 启用浮层隐藏失败，继续原流程', err);
    }
  }

  return async () => {
    try {
      await page.evaluate((styleId, markAttr) => {
        document.getElementById(styleId)?.remove();
        const marked = Array.from(document.querySelectorAll(`[${markAttr}]`));
        for (const node of marked) {
          node.removeAttribute(markAttr);
        }
      }, SCREENSHOT_STABILITY_STYLE_ID, SCREENSHOT_OVERLAY_MARK_ATTR);
    } catch (err) {
      if (config.outputLogs) {
        logger.warn('[截图流程] 恢复页面临时样式失败', err);
      }
    }
  };
}

async function captureTweetScreenshot(page: any, config: Config, scene: string): Promise<Buffer | null> {
  const element = await page.waitForSelector(TWEET_ARTICLE_SELECTOR, { timeout: 15000 });
  if (!element) return null;
  const restoreVisualGuards = await installScreenshotVisualGuards(page, config);

  try {
    try {
      await element.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      });
    } catch (err) {
      if (config.outputLogs) {
        logger.warn(`[截图流程] ${scene} 滚动定位失败，继续尝试截图`, err);
      }
    }

    try {
      await waitForTweetImagesLoaded(page, TWEET_ARTICLE_SELECTOR);
    } catch (err) {
      if (config.outputLogs) {
        logger.info(`[截图流程] ${scene} 图片等待超时，按当前渲染结果继续`);
      }
    }

    const stableBox = await waitForStableElementBox(element);
    await waitBeforeScreenshot(config, scene);

    try {
      const buf = await element.screenshot({ type: 'webp' });
      if (config.outputLogs) {
        logger.info(`[截图流程] ${scene} 使用元素截图成功`, {
          width: stableBox?.width || 0,
          height: stableBox?.height || 0,
        });
      }
      return buf;
    } catch (err) {
      if (config.outputLogs) {
        logger.warn(`[截图流程] ${scene} 元素截图失败，回退到 clip 截图`, err);
      }
    }

    const viewport = page.viewport?.();
    const box = stableBox || await element.boundingBox();
    const clip = clampClipToViewport(box, viewport);
    if (!clip) return null;

    const fallback = await page.screenshot({
      clip,
      type: 'webp',
      captureBeyondViewport: true,
    });
    if (config.outputLogs) {
      logger.info(`[截图流程] ${scene} 使用 clip 回退截图成功`, clip);
    }
    return fallback;
  } finally {
    await restoreVisualGuards();
  }
}

function isManualTwitterCommandMessage(content: string): boolean {
  const trimmed = toNonEmptyString(content);
  if (!trimmed) return false;
  return /^\/?twitter(?:\s|$)/i.test(trimmed);
}

function toNonEmptyString(input: any): string {
  return typeof input === 'string' ? input.trim() : '';
}

function isTcoUrlToken(token: string): boolean {
  const cleaned = token
    .replace(/^[\(\[【<"'`]+/, '')
    .replace(/[\)\]】>"'`,.;:!?，。？！、]+$/g, '');
  if (!/^https?:\/\//i.test(cleaned)) return false;
  try {
    const u = new URL(cleaned);
    return (u.hostname || '').toLowerCase() === 't.co';
  } catch {
    return false;
  }
}

function normalizeTweetTextFromApi(rawText: string, mediaCount: number, outputLogs?: boolean): string {
  const text = toNonEmptyString(rawText);
  if (!text) return '';
  if (mediaCount <= 0) return text;
  const tokens = text.split(/\s+/).map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return '';
  const placeholderOnly = tokens.every(isTcoUrlToken);
  if (!placeholderOnly) return text;
  if (outputLogs) {
    logger.info('[正文清洗] 检测到仅含 t.co 媒体占位链接，已清空正文', { mediaCount, text });
  }
  return '';
}

function getPromptTemplate(config: Config): string {
  return (config.prompt && config.prompt.trim()) ? config.prompt : DEFAULT_PROMPT;
}

function fillPromptTemplate(promptTemplate: string, text: string): string {
  const safeText = text ?? '';
  if (promptTemplate.includes('{text}')) {
    return promptTemplate.replace('{text}', safeText);
  }
  return `${promptTemplate}\n${safeText}`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const safeSize = Math.max(1, Math.floor(chunkSize || 1));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

function detectImageMime(buffer: Buffer): string {
  if (!buffer || buffer.length < 12) return 'image/jpeg';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'image/webp';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  return 'image/jpeg';
}

function extractOriginalTweetImageUrlsForLLM(mediaUrls: string[], config?: Config): string[] {
  const result = (mediaUrls || []).filter((url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (!/^https?:\/\//.test(lower)) return false;
    if (lower.startsWith('data:')) return false;
    if (lower.endsWith('.mp4')) return false;
    return true;
  });
  if (config?.outputLogs) {
    logger.info('[LLM输入图片] 图片来源约束：仅使用推文原始 mediaUrls，不包含 Puppeteer 截图', {
      mediaUrlCount: (mediaUrls || []).length,
      selectedCount: result.length,
    });
  }
  return result;
}

function isNoTextImageMarker(value: string): boolean {
  const normalized = toNonEmptyString(value).replace(/\s+/g, '');
  if (!normalized) return true;
  return /^(?:无可识别文字|无可识别文本|无文字|无文本|none|n\/a|na|空|（无可识别文字）)$/.test(normalized.toLowerCase());
}

function isNoTextImageResponse(value: string): boolean {
  const source = toNonEmptyString(value);
  if (!source) return true;
  const lines = source
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[\-\*\d\.\)\(【\[\]：:\s]+/, '').trim());
  if (!lines.length) return true;
  return lines.every(line => {
    if (isNoTextImageMarker(line)) return true;
    return /无可识别文字|无可识别文本|无文字|no\s*text|no\s*readable\s*text/i.test(line);
  });
}

function parseImageFieldLine(rawLine: string): { index: number; field: 'translated' | 'original'; value: string } | null {
  const line = toNonEmptyString(rawLine)
    .replace(/^[\-\*\u2022]+\s*/, '')
    .trim();
  if (!line) return null;

  const indexedColon = line.match(/^图片\s*(\d+)\s*(译文|原文)\s*(?:[:：]\s*(.*))?$/);
  if (indexedColon) {
    return {
      index: Number(indexedColon[1]),
      field: indexedColon[2] === '译文' ? 'translated' : 'original',
      value: (indexedColon[3] || '').trim(),
    };
  }

  const indexedBracket = line.match(/^[\[\【]\s*图片\s*(\d+)\s*(译文|原文)\s*[\]\】]\s*(?:[:：]\s*(.*))?$/);
  if (indexedBracket) {
    return {
      index: Number(indexedBracket[1]),
      field: indexedBracket[2] === '译文' ? 'translated' : 'original',
      value: (indexedBracket[3] || '').trim(),
    };
  }

  const singleColon = line.match(/^图片\s*(译文|原文)\s*(?:[:：]\s*(.*))?$/);
  if (singleColon) {
    return {
      index: 1,
      field: singleColon[1] === '译文' ? 'translated' : 'original',
      value: (singleColon[2] || '').trim(),
    };
  }

  const singleBracket = line.match(/^[\[\【]\s*图片\s*(译文|原文)\s*[\]\】]\s*(?:[:：]\s*(.*))?$/);
  if (singleBracket) {
    return {
      index: 1,
      field: singleBracket[1] === '译文' ? 'translated' : 'original',
      value: (singleBracket[2] || '').trim(),
    };
  }

  return null;
}

function parseImageTranslationResult(text: string): ImageTranslationResult {
  const source = toNonEmptyString(text);
  if (!source) return { translated: '', original: '', raw: '' };
  const lines = source.split('\n');
  const rows = new Map<number, { translated?: string; original?: string }>();
  let lastHit: { index: number; field: 'translated' | 'original' } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^第\s*\d+\s*批/.test(line)) continue;
    const parsedField = parseImageFieldLine(line);
    if (parsedField) {
      const { index, field, value } = parsedField;
      const prev = rows.get(index) || {};
      prev[field] = value;
      rows.set(index, prev);
      lastHit = { index, field };
      continue;
    }
    if (lastHit) {
      const prev = rows.get(lastHit.index) || {};
      prev[lastHit.field] = `${prev[lastHit.field] || ''}\n${line}`.trim();
      rows.set(lastHit.index, prev);
    }
  }

  if (!rows.size) {
    if (isNoTextImageResponse(source)) {
      return {
        translated: '',
        original: '',
        raw: source,
      };
    }
    return {
      translated: source,
      original: '',
      raw: source,
    };
  }

  const sortedIndexes = Array.from(rows.keys()).sort((a, b) => a - b);
  const translatedLines: string[] = [];
  const originalLines: string[] = [];
  for (const index of sortedIndexes) {
    const row = rows.get(index) || {};
    if (row.translated && !isNoTextImageMarker(row.translated)) {
      translatedLines.push(`图片${index}译文：${row.translated}`);
    }
    if (row.original && !isNoTextImageMarker(row.original)) {
      originalLines.push(`图片${index}原文：${row.original}`);
    }
  }
  return {
    translated: translatedLines.join('\n').trim(),
    original: originalLines.join('\n').trim(),
    raw: source,
  };
}

function parseIndexedImageFieldBlocks(text: string, fieldLabel: '译文' | '原文'): Array<{ index: number; content: string }> {
  const source = toNonEmptyString(text);
  if (!source) return [];
  const lines = source.split('\n');
  const rows = new Map<number, string>();
  let lastIndex: number | null = null;
  const targetField = fieldLabel === '译文' ? 'translated' : 'original';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsedField = parseImageFieldLine(line);
    if (parsedField) {
      if (parsedField.field === targetField) {
        rows.set(parsedField.index, parsedField.value);
        lastIndex = parsedField.index;
      } else {
        lastIndex = null;
      }
      continue;
    }
    if (lastIndex !== null) {
      rows.set(lastIndex, `${rows.get(lastIndex) || ''}\n${line}`.trim());
    }
  }

  if (!rows.size) {
    return [];
  }

  return Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, content]) => ({ index, content: toNonEmptyString(content) }))
    .filter(item => !!item.content);
}

function formatImageTranslatedSections(imageTranslated: string): string[] {
  const blocks = parseIndexedImageFieldBlocks(imageTranslated, '译文');
  if (!blocks.length) return [];
  if (blocks.length === 1) {
    return ['[图片译文]', blocks[0].content];
  }
  const lines: string[] = [];
  for (const [position, block] of blocks.entries()) {
    if (position > 0) {
      lines.push('');
    }
    lines.push(`[图片${block.index}译文]`);
    lines.push(block.content);
  }
  return lines;
}

function summarizeMessages(messages: ChatMessage[]) {
  let imageCount = 0;
  for (const msg of messages) {
    if (Array.isArray(msg?.content)) {
      imageCount += msg.content.filter(item => item?.type === 'image_url').length;
    }
  }
  return {
    messageCount: messages.length,
    imageCount,
  };
}

async function callLLM(messages: ChatMessage[], ctx: Context, config: Config, scene: string): Promise<string> {
  const url = `${config.apiurl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  const retryLimit = Math.max(1, config.translateRetries ?? 3);
  let attempts = 0;

  while (attempts < retryLimit) {
    try {
      if (config.outputLogs) {
        logger.info(`[${scene}] 准备调用翻译模型`, {
          url,
          model: config.model,
          ...summarizeMessages(messages),
        });
      }
      const response = await ctx.http.post(url, {
        model: config.model,
        messages,
        stream: false,
      }, { headers });
      const rawContent = response?.choices?.[0]?.message?.content;
      const textContent = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map(item => item?.text || '').join('\n')
          : '';
      const parsed = toNonEmptyString(textContent);
      if (config.outputLogs) {
        logger.info(`[${scene}] 模型调用完成`, {
          contentLength: parsed.length,
          hasChoices: !!response?.choices,
        });
      }
      return parsed;
    } catch (err) {
      attempts++;
      logger.error(`[${scene}] 调用失败，正在尝试第 ${attempts} 次重试...`, err);
      if (attempts >= retryLimit) {
        logger.error(`[${scene}] 已达最大重试次数`, err);
        return '';
      }
      await sleep(1000 * attempts);
    }
  }
  return '';
}

async function translateText(text: string, ctx: Context, config: Config, scene = '正文翻译'): Promise<string> {
  const source = toNonEmptyString(text);
  if (!source || !isTranslateEnabled(config)) return '';
  const prompt = fillPromptTemplate(getPromptTemplate(config), source);
  return callLLM([{ role: 'user', content: prompt }], ctx, config, scene);
}

async function fetchBinaryWithRetry(
  ctx: Context,
  mediaUrl: string,
  config: Config,
  maxRetries = 3,
  mediaKind = '图片',
  mediaBufferCache?: Map<string, Buffer>
): Promise<Buffer | null> {
  if (mediaBufferCache?.has(mediaUrl)) {
    const cached = mediaBufferCache.get(mediaUrl) || null;
    if (cached && config.outputLogs) {
      logger.info(`[${mediaKind}] 命中缓存`, { mediaUrl, bytes: cached.length });
    }
    if (cached) return cached;
  }
  let attempts = 0;
  while (attempts < Math.max(1, maxRetries)) {
    try {
      const response = await ctx.http.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': REQUEST_USER_AGENT,
        }
      });
      const buffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
      if (mediaBufferCache) {
        mediaBufferCache.set(mediaUrl, buffer);
      }
      if (config.outputLogs) {
        logger.info(`[${mediaKind}] 下载成功`, { mediaUrl, bytes: buffer.length });
      }
      return buffer;
    } catch (error) {
      attempts++;
      logger.error(`[${mediaKind}] 下载失败，正在尝试第 ${attempts} 次重试: ${mediaUrl}`, error);
      if (attempts >= Math.max(1, maxRetries)) {
        logger.error(`[${mediaKind}] 下载失败，已达最大重试次数: ${mediaUrl}`, error);
        return null;
      }
      await sleep(800 * attempts);
    }
  }
  return null;
}

async function buildImageElementsFromUrls(
  ctx: Context,
  urls: string[],
  config: Config,
  mediaBufferCache?: Map<string, Buffer>
): Promise<any[]> {
  const imagePromises = urls.map(async (imageUrl) => {
    const buffer = await fetchBinaryWithRetry(ctx, imageUrl, config, 3, '图片', mediaBufferCache);
    if (!buffer) return null;
    const img = h.image(buffer, detectImageMime(buffer));
    if (!img && config.outputLogs) {
      logger.warn("图片转码结果为空，image_url:", imageUrl);
    }
    return img;
  });
  return (await Promise.all(imagePromises)).filter(item => !!item);
}

async function compressImageToLimit(pptr: any, inputBuffer: Buffer, maxBytes: number, config: Config, tag: string): Promise<Buffer | null> {
  if (!inputBuffer) return null;
  if (inputBuffer.length <= maxBytes) return inputBuffer;
  let page;
  try {
    page = await pptr.page();
    const result = await page.evaluate(async (args) => {
      const { base64, inputMime, maxBytes } = args;
      const dataUrl = `data:${inputMime};base64,${base64}`;
      const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image-load-failed'));
        img.src = src;
      });
      const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error('blob-to-base64-failed'));
        reader.readAsDataURL(blob);
      });

      try {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return { ok: false, reason: 'canvas-unavailable' };

        const qualities = [0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.32];
        let scale = 1;
        let best: any = null;
        for (let round = 0; round < 8; round++) {
          const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
          const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
          canvas.width = width;
          canvas.height = height;
          ctx2d.clearRect(0, 0, width, height);
          ctx2d.drawImage(img, 0, 0, width, height);

          for (const quality of qualities) {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (!blob) continue;
            const encoded = await blobToBase64(blob);
            const candidate = {
              size: blob.size,
              base64: encoded,
              width,
              height,
              quality,
              mime: 'image/jpeg',
            };
            if (!best || candidate.size < best.size) best = candidate;
            if (blob.size <= maxBytes) {
              return { ok: true, withinLimit: true, ...candidate };
            }
          }
          scale *= 0.85;
        }

        if (best) {
          return { ok: true, withinLimit: best.size <= maxBytes, ...best };
        }
        return { ok: false, reason: 'compress-no-result' };
      } catch (error: any) {
        return { ok: false, reason: String(error?.message || error || 'compress-error') };
      }
    }, {
      base64: inputBuffer.toString('base64'),
      inputMime: detectImageMime(inputBuffer),
      maxBytes,
    });

    if (!result?.ok || !result?.base64) {
      if (config.outputLogs) {
        logger.warn(`[图片压缩] ${tag} 失败`, result);
      }
      return null;
    }
    const output = Buffer.from(result.base64, 'base64');
    if (config.outputLogs) {
      logger.info(`[图片压缩] ${tag}`, {
        originalBytes: inputBuffer.length,
        outputBytes: output.length,
        width: result.width,
        height: result.height,
        quality: result.quality,
        withinLimit: !!result.withinLimit,
      });
    }
    return output;
  } catch (error) {
    logger.error(`[图片压缩] ${tag} 异常`, error);
    return null;
  } finally {
    if (page) await page.close().catch(() => { });
  }
}

async function prepareImagesForLLM(
  ctx: Context,
  imageUrls: string[],
  config: Config,
  mediaBufferCache?: Map<string, Buffer>
): Promise<PreparedImageForLLM[]> {
  const maxBytes = Math.max(64, config.llmImageInputSizeLimitKB ?? 1024) * 1024;
  const results: Array<PreparedImageForLLM | null> = new Array(imageUrls.length).fill(null);
  let cursor = 0;
  const workerCount = Math.min(3, Math.max(1, imageUrls.length));

  const processOne = async (i: number): Promise<PreparedImageForLLM | null> => {
    const imageUrl = imageUrls[i];
    const original = await fetchBinaryWithRetry(ctx, imageUrl, config, 3, 'LLM输入图片', mediaBufferCache);
    if (!original) {
      if (config.outputLogs) {
        logger.warn(`[LLM输入图片] 图片${i + 1} 下载失败，已跳过`, { imageUrl });
      }
      return null;
    }

    let finalBuffer = original;
    if (original.length > maxBytes) {
      const compressed = await compressImageToLimit(ctx.puppeteer, original, maxBytes, config, `图片${i + 1}`);
      if (!compressed) {
        if (config.outputLogs) {
          logger.warn(`[LLM输入图片] 图片${i + 1} 压缩失败，已跳过`, {
            imageUrl,
            originalBytes: original.length,
            maxBytes,
          });
        }
        return null;
      }
      finalBuffer = compressed;
    }

    if (finalBuffer.length > maxBytes) {
      if (config.outputLogs) {
        logger.warn(`[LLM输入图片] 图片${i + 1} 压缩后仍超限，已跳过`, {
          imageUrl,
          finalBytes: finalBuffer.length,
          maxBytes,
        });
      }
      return null;
    }

    const mime = detectImageMime(finalBuffer);
    return {
      index: i + 1,
      sourceUrl: imageUrl,
      originalBytes: original.length,
      finalBytes: finalBuffer.length,
      dataUrl: `data:${mime};base64,${finalBuffer.toString('base64')}`,
    };
  };

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= imageUrls.length) break;
      results[i] = await processOne(i);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const prepared = results.filter(item => !!item) as PreparedImageForLLM[];
  if (config.outputLogs) {
    logger.info('[LLM输入图片] 预处理完成', {
      requestedCount: imageUrls.length,
      preparedCount: prepared.length,
      maxBytes,
      workerCount,
    });
  }
  return prepared;
}

async function translateImagesInBatches(
  textOriginal: string,
  imageUrls: string[],
  ctx: Context,
  config: Config,
  mediaBufferCache?: Map<string, Buffer>
): Promise<ImageTranslationResult> {
  if (!isTranslateEnabled(config) || !config.llmImageInputEnabled) return { translated: '', original: '', raw: '' };
  if (!imageUrls.length) return { translated: '', original: '', raw: '' };

  const prepared = await prepareImagesForLLM(ctx, imageUrls, config, mediaBufferCache);
  if (!prepared.length) return { translated: '', original: '', raw: '' };

  const batchLimit = Math.max(1, config.llmImageInputLimit ?? 2);
  const batches = chunkArray(prepared, batchLimit);
  const basePrompt = fillPromptTemplate(getPromptTemplate(config), toNonEmptyString(textOriginal));
  const translatedBlocks: string[] = [];
  let rollingContext = '';

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const imageIndexDesc = batch.map(item => item.index).join('、');
    const contextChunk = rollingContext ? `前序批次上下文（用于术语统一）：\n${rollingContext.slice(-2500)}\n\n` : '';
    const instruction = [
      basePrompt,
      '',
      IMAGE_TRANSLATION_PROMPT_APPEND,
      '',
      contextChunk,
      `当前仅处理这些图片序号：${imageIndexDesc}。请严格输出“图片X译文/图片X原文”格式（先译文，后原文）。`,
    ].join('\n');

    const content = [
      { type: 'text', text: instruction },
      ...batch.map(item => ({ type: 'image_url', image_url: { url: item.dataUrl } })),
    ];
    const output = await callLLM([{ role: 'user', content }], ctx, config, `图片翻译-批次${i + 1}`);
    const block = toNonEmptyString(output);
    if (!block) {
      if (config.outputLogs) {
        logger.info(`[图片翻译-批次${i + 1}] 模型返回空内容（通常表示该批图片无可识别文字）`);
      }
      continue;
    }
    translatedBlocks.push(block);
    rollingContext = `${rollingContext}\n[第${i + 1}批]\n${block}`.slice(-6000);
  }

  if (!translatedBlocks.length) {
    return { translated: '', original: '', raw: '' };
  }
  const merged = translatedBlocks.join('\n').trim();
  return parseImageTranslationResult(merged);
}

async function buildTweetTranslationBundle(params: BuildTranslationBundleParams): Promise<TweetTranslationBundle> {
  const { textOriginal, altOriginalList, mediaUrls, mediaBufferCache, ctx, config } = params;
  const text = toNonEmptyString(textOriginal);
  const normalizedAlt = (altOriginalList || []).map(item => toNonEmptyString(item)).filter(Boolean);
  const imageUrls = extractOriginalTweetImageUrlsForLLM(mediaUrls || [], config);
  const bundle: TweetTranslationBundle = {
    textOriginal: text,
    textTranslated: text,
    altOriginalList: normalizedAlt,
    altTranslated: '',
    imageOriginal: '',
    imageTranslated: '',
  };

  if (!isTranslateEnabled(config)) {
    return bundle;
  }

  const textTranslated = await translateText(text, ctx, config, '正文翻译');
  if (toNonEmptyString(textTranslated)) {
    bundle.textTranslated = textTranslated;
  }

  if (normalizedAlt.length > 0) {
    const altSource = normalizedAlt.map((alt, i) => `ALT${i + 1}原文：${alt}`).join('\n');
    const altPrompt = [
      fillPromptTemplate(getPromptTemplate(config), altSource),
      '',
      ALT_TRANSLATION_PROMPT_APPEND,
    ].join('\n');
    const altTranslated = await callLLM([{ role: 'user', content: altPrompt }], ctx, config, 'ALT翻译');
    bundle.altTranslated = toNonEmptyString(altTranslated);
  }

  if (config.llmImageInputEnabled && imageUrls.length > 0) {
    const imageResult = await translateImagesInBatches(text, imageUrls, ctx, config, mediaBufferCache);
    bundle.imageTranslated = imageResult.translated;
    bundle.imageOriginal = imageResult.original;
  } else if (config.outputLogs && imageUrls.length > 0) {
    logger.info('[图片翻译] 未启用 LLM 输入图片支持，跳过图片翻译链路');
  }

  return bundle;
}

function buildTweetIntroMessage(params: BuildIntroMessageParams): string {
  const {
    heading,
    messagePrefix,
    isVideo,
    bundle,
    isRetweet,
    showTranslationSections,
    bilingualOutput,
  } = params;
  const lines: string[] = [];
  const title = `${heading ? `${heading} ` : ''}${messagePrefix}一条${isVideo ? '视频' : '图片'}推文：`;
  lines.push(title);
  if (isRetweet) {
    lines.push('[提醒：这是一条转发推文]');
  }

  if (!showTranslationSections) {
    lines.push(bundle.textOriginal || '（无正文）');
    if (bundle.altOriginalList.length > 0) {
      lines.push(...bundle.altOriginalList.map((alt, i) => `ALT${i + 1}原文：${alt}`));
    }
    return lines.join('\n');
  }

  lines.push(bundle.textTranslated || '（无正文）');
  if (bilingualOutput) {
    lines.push('[文字原文]');
    lines.push(bundle.textOriginal || '（无正文）');
  }

  const imageTranslatedSections = formatImageTranslatedSections(bundle.imageTranslated);
  if (imageTranslatedSections.length > 0) {
    lines.push('');
    lines.push(...imageTranslatedSections);
  }
  if (bilingualOutput && bundle.imageOriginal) {
    lines.push('[图片原文]');
    lines.push(bundle.imageOriginal);
  }

  if (bundle.altTranslated) {
    lines.push('[ALT译文]');
    lines.push(bundle.altTranslated);
  }
  if (bilingualOutput && bundle.altOriginalList.length > 0) {
    lines.push('[ALT原文]');
    lines.push(...bundle.altOriginalList.map((alt, i) => `ALT${i + 1}原文：${alt}`));
  }

  return lines.join('\n');
}

async function getTimePushedTweet(ctx, pptr, url, config, maxRetries?: number): Promise<TweetDetailResult> { // 获取需要推送的推文具体内容
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
      await applyStableScreenshotViewport(page, config);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // 等待推文容器渲染
      await page.waitForSelector('article', { timeout: 30000 });
      // 检查是否为受保护账号
      const isProtected = await page.evaluate(() => {
        return !!document.querySelector('[aria-label="受保护账号"]');
      });
      const screenshotScene = isProtected ? '受保护推文截图' : '公开推文截图';
      const screenshotBuffer = await captureTweetScreenshot(page, config, screenshotScene);
      if (!screenshotBuffer) {
        throw new Error('未能获取推文截图');
      }

      if (isProtected) {
        // 受保护账号：只获取文字和截图，不返回媒体
        const word_content = await page.evaluate(() => {
          const el = document.querySelector('div[data-testid="tweetText"]');
          return el ? el.textContent.trim() : '';
        });
        return {
          word_content: `${word_content}\n（注：此账号为受保护账号，故不提供具体媒体内容）`,
          altTexts: [],
          mediaUrls: [],
          screenshotBuffer
        };
      } else {
        // 请求 vxtwitter API
        const apiUrl = url.replace(/(twitter\.com|x\.com)/, 'api.vxtwitter.com');
        if (config.outputLogs) {
          logger.info('请求 vxtwitter API URL:', apiUrl);
        }
        let apiAttempts = 0;
        while (apiAttempts < retryLimit) {
          try {
            const apiResponse = await ctx.http.get(apiUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            if (config.outputLogs) {
              logger.info('成功接收到 vxtwitter API 的响应', {
                hasText: !!apiResponse?.text,
                mediaCount: apiResponse?.media_extended?.length || 0,
              });
            }
            // 提取图片的 ALT 文本（原始未翻译）
            let altTexts: string[] = [];
            if (apiResponse.media_extended && apiResponse.media_extended.length > 0) {
              altTexts = apiResponse.media_extended
                .filter((m) => m.altText && m.altText.trim())
                .map((m) => m.altText.trim());
            }
            const mediaUrls = apiResponse.media_extended ? apiResponse.media_extended.map(m => m.url) : [];
            const normalizedWordContent = normalizeTweetTextFromApi(
              apiResponse.text || "",
              mediaUrls.length,
              config.outputLogs
            );
            return {
              word_content: normalizedWordContent,
              altTexts: altTexts,  // 保留原始ALT文本用于显示原文
              mediaUrls: mediaUrls,
              screenshotBuffer
            };
          } catch (err) {
            apiAttempts++;
            logger.error(`请求 vxtwitter API 失败，正在尝试第 ${apiAttempts} 次重试...`, err);
            if (apiAttempts >= retryLimit) {
              // 如果API请求失败，返回空结果
              return {
                word_content: '',
                altTexts: [],
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
          altTexts: [],
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
          const altTexts = tpTweet.altTexts || [];
          const mediaBufferCache = new Map<string, Buffer>();
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
          const translationBundle = await buildTweetTranslationBundle({
            textOriginal: tweetText,
            altOriginalList: altTexts,
            mediaUrls,
            mediaBufferCache,
            ctx,
            config,
          });

          // 判断是否命中违禁词
          if (blogger.blacklist && blogger.blacklist.length > 0) {
            const moderationCorpus = [
              translationBundle.textTranslated,
              translationBundle.textOriginal,
              translationBundle.altTranslated,
              translationBundle.altOriginalList.join('\n'),
              translationBundle.imageTranslated,
              translationBundle.imageOriginal,
            ].join('\n').toLowerCase();
            const hitWords = blogger.blacklist.filter(word => {
              const lowerWord = word.toLowerCase();
              return moderationCorpus.includes(lowerWord);
            });
            if (hitWords.length > 0) {
              logger.info(`推文包含违禁词：${hitWords.join(', ')}，跳过推送`);
              continue;
            }
          }

          // 准备botkey
          const botKey = `${config.platform}:${config.account}`;

          // 根据是否为视频推文构造不同的消息结构
          if (isVideo) {
            // 视频推文：先发送文字+截图
            let textMsg = buildTweetIntroMessage({
              heading: `【${id}】`,
              messagePrefix: config.messagePrefix,
              isVideo: true,
              bundle: translationBundle,
              isRetweet,
              showTranslationSections: isTranslateEnabled(config),
              bilingualOutput: isBilingualOutput(config),
            });
            textMsg += "\n";
            textMsg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}`;
            // 收集图片
            const imageUrls = mediaUrls.filter(url => !url.endsWith('.mp4'));
            if (imageUrls.length > 0) {
              const images = await buildImageElementsFromUrls(ctx, imageUrls, config, mediaBufferCache);
              textMsg += `${images.join('\n')}`;
            }
            // 单独发送mp4视频
            const videoUrl = mediaUrls.find(url => url.endsWith('.mp4'));
            let video_response: Buffer | null = null;
            if (videoUrl) {
              video_response = await fetchBinaryWithRetry(ctx, videoUrl, config, 3, '视频');
              if (video_response && config.outputLogs) {
                logger.info(`成功请求视频文件: ${videoUrl}`);
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
            let msg = buildTweetIntroMessage({
              heading: `【${id}】`,
              messagePrefix: config.messagePrefix,
              isVideo: false,
              bundle: translationBundle,
              isRetweet,
              showTranslationSections: isTranslateEnabled(config),
              bilingualOutput: isBilingualOutput(config),
            });
            msg += "\n";
            msg += `${h.image(tpTweet.screenshotBuffer, "image/webp")}\n`;
            if (mediaUrls.length > 0) {
              const images = await buildImageElementsFromUrls(ctx, mediaUrls, config, mediaBufferCache);
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
        if (session?.send) {
          await session.send(`加载博主 ${id} 的页面时出错，可能是网络问题或链接不合法。请检查链接的合法性或稍后重试。`);
        }
      }
    }
  } catch (error) {
    logger.error('主函数错误：', error);
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
