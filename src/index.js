const Aws = require('aws-sdk');
const https = require('https');
const s3 = new Aws.S3({ apiVersion: '2006-03-01',  signatureVersion: 'v4' });
const line = require('@line/bot-sdk');
const Translate = new Aws.Translate({region: 'us-east-1'});
const textract = new Aws.Textract({region: 'us-east-2'});
const transcribeservice = new Aws.TranscribeService({apiVersion: '2017-10-26',region:"ap-northeast-1"});

//LINEアクセストークン設定
const client = new line.Client({
    channelAccessToken: process.env.ACCESS_TOKEN
});

exports.handler = async event => {
    console.log('◆EVENT:', event);
    const event_data = JSON.parse(event.body);
    console.log('◆EVENT.BODY:', JSON.stringify(event_data));
    const messageData = event_data.events && event_data.events[0];
    console.log("◆TEXT:" + JSON.stringify(messageData.message.text));
    console.log(messageData.message.type); //メッセージ内容表示
    
    // const Event = event.events[0];
    // var replyToken = Event.replyToken;
    // var message = Event.message;
    // var userId = Event.source.userId;
    // if(message.type === 'text')
    if(messageData.message.type === "text"){
    const LineMessage = messageData.message.text;
    let result = await getTranslate(LineMessage);
    const postData =  {
            "type": "text",
            "text": result.TranslatedText + "\n" + "\n" + "Bot翻訳システム(日→英)"
    };

    try {
        await client.replyMessage(messageData.replyToken, postData);
    } catch (error) {
        console.log(error);
    }
        
    }else{
        if(messageData.message.type === "image"){
            const imagedate = await getImage(messageData.message.id);
            console.log(imagedate);
            // await putS3Object(imagedate,messageData.message.id);
            const detectText = await DetectTextract(Buffer.concat(imagedate));
            console.log(detectText);
            console.log(detectText.Blocks);
            const AIText = detectText.Blocks;
            console.log((AIText.length));
            const AIItems = [];
            for(let i=0;i<AIText.length;i++){
                if(AIText[i].BlockType === "WORD"){
                    AIItems.push(AIText[i].Text);
                }
            }
            console.log(AIItems);
            const result = AIItems.join().split(",").join(" ");
            console.log(result);
            const translateText2 = await getTranslate2(result);
                
            const postImage =  {
                    "type": "text",
                    "text": "画像検出結果:"+ "\n" + result + "\n"+"翻訳結果:" +"\n"+ translateText2.TranslatedText +"\n"+"\n" + "萩原のBot翻訳システム(日→英)より"
            };

            try {
                await client.replyMessage(messageData.replyToken, postImage);
            } catch (error) {
                console.log(error);
            };
        }else{
            const imagedate = await getImage(messageData.message.id);
            console.log(imagedate);
            await putS3Object(imagedate,messageData.message.id);
            const url = "https://s3-ap-northeast-1.amazonaws.com/" + "hagi-line-bot-s3" + '/' + messageData.message.id + ".mp3"
            const params = {
                            LanguageCode: "ja-JP",                 
                            Media: {                        
                              MediaFileUri: url
                            },
                            TranscriptionJobName: messageData.message.id,
                            MediaFormat: "mp4",
                        };
                        
            const result = await transcribeText(params);
            console.log(result);
           
            while (true){
                const result2 = await GetTranscriptionJob(messageData.message.id)
                console.log(result2);
                const status = result2.TranscriptionJob.TranscriptionJobStatus ;
                if(status !== "IN_PROGRESS"){
                    break;
                };
            };
            
            
            const postData =  {
                "type": "text",
                "text": "それは音声だ" + "\n" + "\n" + "Bot翻訳システム(日→英)"
            };
    
            try {
                await client.replyMessage(messageData.replyToken, postData);
            } catch (error) {
                console.log(error);
            };
        }
    }
}

function getTranslate2(org_text) {
    return new Promise(((resolve, reject) => {
        let params = {
            Text: org_text,
            SourceLanguageCode: 'en',
            TargetLanguageCode: 'ja',
        };

        Translate.translateText(params, function(err,data){
            if (err) {
                console.log(err);
                reject();
            } else {
                console.log(JSON.stringify(data));
                resolve(data);
            };
        });
    }));
};

function GetTranscriptionJob(id){
     return new Promise(((resolve, reject) => {
    var params = {
                  TranscriptionJobName: id
                };
    transcribeservice.getTranscriptionJob(params, function(err, data) {
            if (err) {
            console.log(err);
            reject();
        } else {
            console.log(JSON.stringify(data));
            resolve(data);
        }
        });
    }));
}


function transcribeText(params){
    return new Promise(((resolve, reject) => {
      transcribeservice.startTranscriptionJob(params, function(err, data) {
              if (err) {
                console.log(err);
                reject();
            } else {
                console.log(JSON.stringify(data));
                resolve(data);
            }
          });
    }));

}

function DetectTextract(data){
    return new Promise(((resolve, reject) => {
        var params = {
              Document: { /* required */
                // Bytes: Buffer.from('...') || 'STRING_VALUE' /* Strings will be Base-64 encoded on your behalf */,
                Bytes: Buffer.from(data),
                // S3Object: {
                //   Bucket: 'hagi-line-bot-s3',
                //   Name: id + ".png",
                // }
              }
            };
       textract.detectDocumentText(params, function(err, data) {
               if (err) {
                console.log(err);
                reject();
            } else {
                console.log(JSON.stringify(data));
                resolve(data);
            }
          });
    }));
}

function getTranslate(org_text) {
    return new Promise(((resolve, reject) => {
        let params = {
            Text: org_text,
            SourceLanguageCode: 'ja',
            TargetLanguageCode: 'en',
        };
        Translate.translateText(params, function(err,data){
            if (err) {
                console.log(err);
                reject();
            } else {
                console.log(JSON.stringify(data));
                resolve(data);
            };
        });
    }));
};

function getImage(id){
    return new Promise((resolve, reject) => {
    client.getMessageContent(id)
      .then((stream) => {
        var data = []
        stream.on('data', (chunk) => {
          data.push(new Buffer.from(chunk))
        });
        stream.on('error', (error) => {
          console.log("Error: line image. " + error)
          reject(error)
        });
        stream.on('end', () => {
          console.log("Success: get line image.");
          resolve(data);
        });
      });
  })
}

function putS3Object(data,id){
    var params = {
        Bucket: 'hagi-line-bot-s3', // ←バケット名
        Key: id + ".mp3", // ←バケットに保存するファイル名
        Body: Buffer.concat(data)
    };
    s3.putObject(params, function(err, data) {
       if (err) {
            console.log(err);
        } else {
            console.log(JSON.stringify(data));
        };
    });
}

