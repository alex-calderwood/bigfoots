let config;

// Make sure you have a configuration file stroed at the project root in a file called config.json
const configureAI = (userConfig) => {
    config = userConfig;
};

// Access Gemini through Google's Node.js API
const callGemini = async (prompt) => { // https://ai.google.dev/gemini-api/docs/quickstart?lang=node
    let gemini;
    try {
        gemini = require('@google/generative-ai').GoogleGenerativeAI;
    } catch(err) {
        console.log(`sv:ai:gemini: ${err}.\nInstall with:\n\tnpm install @google/generative-ai`)
        return null;
    }

    const genAI = new gemini(config[config.providers.llm]);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

// Access OpenAI
const callOpenAI = async (prompt) => {
    let OpenAI;
    try {
        OpenAI = require('openai').default;
    } catch(err) {
        console.log(`sv:ai:openai: ${err}.\nInstall with:\n\tnpm install openai`)
        return null;
    }
        
    const openai = new OpenAI({
        apiKey: config.openai.key,
    });

    // write now we are using the gemini api key through the openai endpoint
    const response = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
    });
 
    return response.choices[0].message.content;
 }

 // Access Gemini through the OpenAI API
 // This is instructive on how you would access other models through the OpenAI API
 const callOpenAIGemini = async (prompt) => {
    if (!config[config.providers.llm]) return null;
    
    let OpenAI;
    try {
        OpenAI = require('openai').default;
    } catch(err) {
        console.log(`sv:ai:openai: ${err}.\nInstall with:\n\tnpm install openai`)
        return null;
    }
        
    const openai = new OpenAI({
        apiKey: config.openaiGemini.key,
        baseURL: config.openaiGemini?.url,
    });

    // write now we are using the gemini api key through the openai endpoint
    const response = await openai.chat.completions.create({
        model: config.openaiGemini.model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
    });
 
    return response.choices[0].message.content;
}

const llmProviders = {
    gemini: callGemini,
    openai: callOpenAI,
    openaiGemini: callOpenAIGemini, 
};

// const callElevenLabs = async (text) => { // https://github.com/elevenlabs/elevenlabs-js
//     let ElevenLabsClient, play;
//     try {
//         ({ ElevenLabsClient, play } = require('elevenlabs'));
//     } catch(err) {
//         console.log(`sv:ai:11labs: ${err}.\nInstall with:\n\tnpm install elevenlabs`)
//         return null;
//     }
    
//     const client = new ElevenLabsClient({apiKey: config.eleven_labs.key});
//     const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
//       text: text,
//       model_id: config.eleven_labs.model,
//       output_format: "mp3_44100_128",
//     });
//     console.log(audio);
//     await play(audio);
//     return audio;
// };

const callElevenLabs = async (text) => {
    let ElevenLabsClient, play;
    try {
        ({ ElevenLabsClient, play } = require('elevenlabs'));
    } catch(err) {
        console.log(`sv:ai:11labs: ${err}.\nInstall with:\n\tnpm install elevenlabs`)
        return null;
    }

    const format = {
        encoding: 'audio/mpeg',
        sampleRate: 44100,
        bitrate: 128,
        codec: 'mp3'
    }
    
    const client = new ElevenLabsClient({apiKey: config.eleven_labs.key});
    const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
        text: text,
        model_id: config.eleven_labs.model,
        output_format: `${format.codec}_${format.sampleRate}_${format.bitrate}`,
    });

    // await play(audio);
    
    return {
        stream: audio,
        format: format, 
    };
};

const ttsProviders = {
    eleven_labs: callElevenLabs,
};


const llm = async (prompt) => {
    if (!config[config.providers.llm]) return null;
    const provider = llmProviders[config.providers.llm];
    return provider ? provider(prompt) : null;
};

const textToSpeech = async (text) => {
    if (!config[config.providers.text2speech]) return null;
    const provider = ttsProviders[config.providers.text2speech];
    return provider ? provider(text) : null;
};

module.exports = { llm, textToSpeech, configureAI};