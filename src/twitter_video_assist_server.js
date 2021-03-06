var workerSpace = {};

var CAPTURE_INTERVAL = 33;
var PLAY_SPEED_RATE = 2.0;

chrome.runtime.onMessage.addListener(processRequest);

function processRequest(request) {
    switch (request.type) {
        case 'gif':
            convertGif(request.url);
            break;

        case 'tsVideo':
            processComplexTsVideo(request.playlistUrl);
            break;

        case 'mp4Video':
            downloadMp4Video(request.url);
            break;
    }
}

function convertGif(url) {
    sendSpinnerStateMessage(false);

    var filename = url.substring(url.lastIndexOf('/') + 1).split(".")[0];
    var worker = createWorker(filename);
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var video = document.createElement('video');

    video.src = url;
    video.crossOrigin = "use-credentials";
    video.playbackRate = PLAY_SPEED_RATE;
    video.preload = "auto";
    video.innerHTML = '<source src="' + video.src + '" type="video/mp4 preload="metadata" />';

    video.oncanplaythrough = processVideo(canvas, context, video, worker);
}

function createWorker(filename) {
    workerSpace[filename] = new Worker('gif_converter.js');
    workerSpace[filename].onmessage = processWorkerData(filename);
    return workerSpace[filename];
}

function processWorkerData(filename) {
    return (event) => {
        chrome.storage.sync.get({
            spcificPathName: false
        }, (items) => {

            var u8Array = new Uint8Array(atob(event.data).split("").map(function (c) {
                return c.charCodeAt(0);
            }));
            var blob = new Blob([u8Array], {
                type: 'image/gif'
            });
            var url = URL.createObjectURL(blob);
            chrome.downloads.download({
                url: url,
                saveAs: items.spcificPathName,
                filename: filename + ".gif"
            });
            workerSpace[filename].terminate();
            delete workerSpace[filename];
            if (numberOfWorker() == 0) {
                sendSpinnerStateMessage(true);
            }
        })
    }
}

function processVideo(canvas, context, video, worker) {
    return () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        captureVideo(context, video, worker)
    }
}

async function captureVideo(context, video, worker) {
    worker.postMessage({
        delay: CAPTURE_INTERVAL * PLAY_SPEED_RATE,
        w: video.videoWidth,
        h: video.videoHeight
    });

    video.play();
    while (!video.ended) {
        draw(context, video, worker);
        await sleep(CAPTURE_INTERVAL);
    }

    worker.postMessage({});
}

function draw(context, video, worker) {
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    var imageData = context.getImageData(0, 0, video.videoWidth, video.videoHeight);
    worker.postMessage({
        frame: imageData
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendSpinnerStateMessage(hide) {
    chrome.tabs.query({
        currentWindow: true,
        url: ["*://*.twitter.com/*", "*://twitter.com/*"]
    }, (tabs) => {
        for (var i in tabs) {
            chrome.tabs.sendMessage(tabs[i].id, {
                hideSpinner: hide
            });
        }
    });
}

function numberOfWorker() {
    return Object.keys(workerSpace).length;
}