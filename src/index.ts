import { Context, Schema,h } from 'koishi'
import Puppeteer, {} from "koishi-plugin-puppeteer";

export const name = 'xanalyse'

export const inject = {required:["puppeteer"]};

export interface Config {}

export const Config: Schema<Config> = Schema.object({
});

export function apply(ctx: Context) {
  ctx.command('twitter', '获取x截图')
    .action(async ({session}) => {
      try {
        const page = await ctx.puppeteer.page();
        await page.setViewport({ width: 1200, height: 800 });
        const tweetUrl = 'https://x.com/home'; 
        await page.goto(tweetUrl, { waitUntil: 'networkidle0' });
        const buffer:any = await page.screenshot({ type: "png" });
        await session.send(h.image(buffer));
        await session.send("1111");
      } catch (error) {
        console.log('获取截图失败', error);
      }
    });
}
