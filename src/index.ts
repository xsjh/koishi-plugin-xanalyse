import { Context, Schema,h } from 'koishi'
import Puppeteer, {} from "koishi-plugin-puppeteer";

export const name = 'xanalyse'

export const inject = {required:["puppeteer"]};

export interface Config {}

export const Config: Schema<Config> = Schema.object({
});

export function apply(ctx: Context) {
  ctx.command('twitter [...arg]', '获取x截图')
    .action(async ({session}, ...arg) => {
      try {
        const url = arg.join(' ').trim();
        if (url == ''){
        await session.send("您输入的url为空");
      }else{
        const tweetContent = await getTweetContent(ctx.puppeteer, url);
        console.log("获取的图片url", tweetContent.imgUrls);
        const msg = `获取成功：
${tweetContent.word_content}
${h.image(tweetContent.buffer)}       
          `
        await session.send(msg);
        
      }
      } catch (error) {
        console.log("获取推文过程失败");
      }
    });

}

async function getTweetContent(pptr,url) {
  try {
    const page = await pptr.page();// 初始化浏览器
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
    const tweetUrl = `${url}`; // 加载url并获取元素
    await page.goto(tweetUrl, { waitUntil: 'networkidle0' });

    // 1、获取推文文字内容
    const element = await page.$('div.timeline-item');
    if (!element) {
      throw new Error('未能找到指定的元素');
    }
    const word_content = await page.evaluate(() => {
      const element = document.querySelector('div.tweet-content.media-body');
      if (!element) return '';
      let textContent = element.textContent || '';
      return textContent.trim();});

    // 2、获取推文文字内容
    const buffer = await element.screenshot({ type: "webp" });// 获取完整截图  
    
    // 3、获取推文图片
    const imgUrls = await page.evaluate(() => {
      const imgelement = document.querySelector('div.gallery-row');
      if (!imgelement) return [];
      
      
      
    });
    // 返回图片与文字
    return {
      imgUrls,
      word_content,
      buffer
    }        
  } catch (error) {
    console.log("加载页面或元素失效，请检查UserAgent", error);
    return {
      imgUrls: [],
      word_content: '',
      buffer: null
    };
  }
}





      
      

      

    
    

 