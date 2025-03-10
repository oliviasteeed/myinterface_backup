console.log("###### NEW RUN #######");
  

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

import cors from 'cors';

import { ChatOpenAI } from "@langchain/openai";

  // instantiate chat model
const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
    temperature: 1,
    n: 1
});

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Allow all origins
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });


app.post("/get-gpt-response", async (req, res) => {
  try {

    // console.log("Received request server.js:", req.body); // Log full request data

    const { message, html, css } = req.body;

      const response = await model.invoke([
        { role: "system", content: "You are a browser popup that modifies the interface of websites based on user requests. Use the current website HTML and CSS, and write a short code snippet including CSS or HTML or both that meets the user request. Leave the main website HTML and CSS intact. Keep added code as short as possible, as they will just be inserted at the start or end of files. Possible changes include changing the colours, fonts, sizing, what is shown or hidden, or even the text enclosed in html tags. Make sure you use the proper selectors based on the current website HTML and CSS, or use workarounds to selectors where possible. Please ONLY RESPOND WITH CSS AND/OR HTML CODE to be added to the end of the existing documents and no other text or code comments. Return in this format with css first starting with ```css: (insert content here)```, then html in this format: ```html: (insert content here)```. You do not need to include both CSS and HTML, so if one is not needed, please respond with ```css:``` for no CSS needed or ```html:``` for no HTML needed." },

        { role: "user", content: `User's Change Request: ${message}, HTML (partial): ${html.slice(0, 3000)}..., CSS (partial): ${css.slice(0, 2000)}...` }
      ]);
      
    console.log("OpenAI Response TEXT:", response.content); // Log text AI output

    res.json({ response: response.content });

    // console.log("I have returned res json (server.js"); 

  } catch (error) {
    console.error("Error in back end: ", error);
    res.status(500).send("Error processing results");
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


  