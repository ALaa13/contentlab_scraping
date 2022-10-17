const express = require('express')
const app = express()
const queue = require('bull')
const PORT = 3000


// Initialize Queue
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const workQueue = new queue('work', REDIS_URL)

app.get('/', async (req, res) => {
    const job = await workQueue.add({url: process.env.URL})
    res.json({id: job.id})
})

workQueue.on('global:completed', (jobId, result) => {
    console.log(`Job completed with result ${result}`)
})

app.listen(process.env.PORT || PORT, () => console.log("Server started!"))
