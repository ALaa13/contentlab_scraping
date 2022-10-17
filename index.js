const {Builder, By} = require('selenium-webdriver')
const chrome = require("selenium-webdriver/chrome")
const statistic = require('summary')
const express = require('express')
const app = express()
const queue = require('bull')
const throng = require('throng');
const PORT = 3000


// Initialize Queue
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const workQueue = new queue('work', REDIS_URL)
const workers = process.env.WEB_CONCURRENCY || 2;
const maxJobsPerWorker = 50;


// Initialize Selenium
const screen = {
    width: 1920,
    height: 1080
}
const options = new chrome.Options()
options.setChromeBinaryPath(process.env.CHROME_BINARY_PATH)
options.addArguments("--headless")
options.addArguments("--disable-gpu")
options.addArguments("--no-sandbox")
options.addArguments("--disable-dev-shm-usage")
options.windowSize(screen);


app.get('/', async (req, res) => {
    const job = await workQueue.add({url: process.env.URL})
    res.json({id: job.id})
});


workQueue.on('global:completed', (jobId, result) => {
    console.log(`Job completed with result ${result}`)
});

function start() {
    // Connect to the named work queue
    workQueue.process(maxJobsPerWorker, async (job) => {
        // This is an example job that just slowly reports on progress
        // while doing no work. Replace this with your own job logic.

        const data = await scrapeAverageViewsTikTok(process.env.URL)
        console.table(data)
        const averageViews = new Intl.NumberFormat().format(Math.trunc(computeAverageViews(data)))
        const engagementRate = new Intl.NumberFormat('en-IN', {maximumSignificantDigits: 3}).format(computeEngagementRate(data))
        console.log(`Average Views = ${averageViews}`)
        console.log(`Engagement Rate = ${engagementRate}`)


        // A job can return values that will be stored in Redis as JSON
        // This return value is unused in this demo application.
        return {averageViews: averageViews, engagementRate: engagementRate}
    });
}


throng({workers, start});
app.listen(process.env.PORT || PORT, () => console.log("Server started!"))


// (async () => {
//     const data = await scrapeAverageViewsTikTok(process.env.URL)
//     console.table(data)
//     const averageViews = new Intl.NumberFormat().format(Math.trunc(computeAverageViews(data)))
//     const engagementRate = new Intl.NumberFormat('en-IN', {maximumSignificantDigits: 3}).format(computeEngagementRate(data))
//     console.log(`Average Views = ${averageViews}`)
//     console.log(`Engagement Rate = ${engagementRate}`)
// })();

/*
    Helper Methods
*/

const processNumbers = item => {
    let number = parseFloat(item.replace(/^\D+/g, ''))
    item.includes('M') ? number *= 1000000 : item.includes('K') ? number *= 1000 : number
    return number
}
const toDate = string => {
    const mapping = {
        w: -7 * 24 * 60 * 60 * 1000,
        d: -24 * 60 * 60 * 1000,
        h: -60 * 60 * 1000,
    }

    const match = string.match(/(?<number>[0-9]*)(?<unit>[a-z]*)/)
    if (match) {
        const {number, unit} = match.groups
        const offset = number * mapping[unit]
        return new Date(Date.now() + offset)
    }
}
const checkDate = date => {
    const then = new Date(date);
    const now = new Date();
    const msBetweenDates = Math.abs(then.getTime() - now.getTime());
    const msToDays = Math.trunc(msBetweenDates / (24 * 60 * 60 * 1000))
    return msToDays > 3 && msToDays < 90
}
const getOutliers = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))

    const firstQuartile = views.quartile(0.25)
    const thirdQuartile = views.quartile(0.75)
    const iqr = thirdQuartile - firstQuartile
    return thirdQuartile + iqr
}
const computeAverageViews = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))
    return views.sum() / views.data().length
}
const computeEngagementRate = data => {
    const views = statistic(data.map(item => processNumbers(item.views)))
    const likes = statistic(data.map(item => processNumbers(item.likes)))
    const comments = statistic(data.map(item => processNumbers(item.comments)))
    const shares = statistic(data.map(item => processNumbers(item.shares)))
    const engagementData = likes.sum() + comments.sum() + shares.sum()
    return engagementData / views.sum()
}

async function scrapeAverageViewsTikTok(url) {
    let serviceBuilder = new chrome.ServiceBuilder(process.env.CHROME_DRIVER_PATH)
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(serviceBuilder).build()
    //await driver.manage().setTimeouts({implicit: 1000})
    console.time("Execution Time: ")
    const data = []
    try {
        const videoLinks = []
        // Get the creator main page
        await driver.get(url)

        // scrape the videos gird of the main page
        const videosGrid = await driver.findElement(By.css("div[mode='compact']"))
        const videos = await videosGrid.findElements(By.xpath('div'))

        // loop over the scraped videos and scrape the Views count and the video link, save them into an array of objects.
        if (videos.length <= 0) {
            return
        }
        for (let video of videos) {
            const href = (await (await video.findElement(By.xpath(`div[1]/div/div/a`))).getAttribute('href'))
            const videoViews = (await (await video.findElement(By.css(`strong[data-e2e='video-views']`))).getAttribute('innerText'))
            videoLinks.push({
                link: href,
                views: videoViews
            })
        }
        const outliersNumber = getOutliers(videoLinks)

        // Loop through array of videos, open each video link, scrape the needed data
        for (let video of videoLinks) {
            const link = video.link
            const views = video.views
            if (processNumbers(views) > outliersNumber)
                continue
            await driver.get(link)
            const likesCount = (await (await driver.findElement(By.css("strong[data-e2e='like-count']"))).getAttribute('innerText'))
            const commentCounts = (await (await driver.findElement(By.css("strong[data-e2e='comment-count']"))).getAttribute('innerText'))
            const shareCounts = (await (await driver.findElement(By.css("strong[data-e2e='share-count']"))).getAttribute('innerText'))
            const videoDate = (await (await (await driver.findElement(By.css("span[data-e2e='browser-nickname']"))).findElement(By.xpath('span[2]'))).getAttribute('innerText'))
            const videoCaption = (await (await driver.findElement(By.css("div[data-e2e='browse-video-desc']"))).getAttribute('innerText'))
            let isPaid
            // Check if the video is Paid Partnership by locating the element.
            try {
                isPaid = (await (await driver.findElement(By.xpath("//p[text()='Paid partnership']"))).getAttribute('innerText'))
            } catch (e) {
                // Look for the keyword ad when the paid partnership is not found
                videoCaption.includes('#ad') ? isPaid = 'ad' : isPaid = 'not promo'
            }
            // Process Date
            let date
            videoDate.match(/[hdw]/gi) ? date = toDate(videoDate) : date = `${new Date().getFullYear()}-${videoDate}`
            if (checkDate(date))
                data.push({
                    views: video.views,
                    likes: likesCount,
                    comments: commentCounts,
                    shares: shareCounts,
                    date: videoDate,
                    //caption: videoCaption,
                    paid: isPaid
                })
            if (data.length >= 10)
                break
        }
    } catch (e) {
        console.log(e)
    } finally {
        // Quite the driver and calculate the execution time.
        await driver.quit()
        console.timeEnd("Execution Time: ")
    }
    return data
}