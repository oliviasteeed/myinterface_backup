// toggle popup on and off by selecting extension button
chrome.action.onClicked.addListener(async (tab) => {
    const data = await chrome.storage.local.get("popupState");

    if (data.popupState === "open") {
        // If the popup is open, close it
        chrome.storage.local.set({ popupState: "closed" });
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                document.getElementById("popup-container")?.remove();
            }
        });
    } else {
        // If the popup is closed, open it
        chrome.storage.local.set({ popupState: "open" });
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"] // Inject content script
        });
    }
});

// call content script on each page load - this makes changes persist across website
chrome.webNavigation.onCompleted.addListener(async (details) => {

    if (details.frameId === 0) {
        console.log("background.js: new page, running content.js from bg.js");
        chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ["content.js"]
        });
    }
});




// Listen for messages from the popup content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "modifyPage") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;

            // Inject and retrieve HTML & CSS from the page
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    const html = document.body.innerHTML;
                    const css = Array.from(document.styleSheets)
                        .map(sheet => {
                            try {
                                return Array.from(sheet.cssRules)
                                    .map(rule => rule.cssText)
                                    .join("\n");
                            } catch (e) {
                                return ""; // Handle CORS issues
                            }
                        })
                        .filter(rules => rules.length > 0) // Remove empty CSS blocks
                        .join("\n");

                    // console.log("HTML:", html);
                    // console.log("CSS:", css);

                    return { html, css };


                },
            }, async (injectionResults) => {

                // Ensure valid results
                if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
                    console.error("background.js: failed to retrieve HTML and CSS");
                    return;
                }

                // if valid results, get data to send request to backend
                const { html, css } = injectionResults[0].result;

                const userMessage = message.message; // User's instruction
                console.log("background.js: usermessage (before llm call)", userMessage);

                try {
                    // Send extracted HTML & CSS to the backend with memory support - langchain llm stuff happening here
                    const response = await sendRequestToBackend(userMessage, html, css);

                    console.log("background.js: gpt response received in bg.js is: !!!!!!", response);

                    // Apply modifications in the content script
                    //   chrome.runtime.sendMessage({ action: "executeChanges", message: response });
                    //   console.log("message sent to content.js");

                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },  // Make sure you're targeting the correct tab
                        func: (response) => {
                            console.log("background.js: modifying script");

                            // get html and css code from llm response
                            function extractHtmlAndCss(response) {

                                const cssMatch = response.match(/```css:\s*([\s\S]*?)\s*```/);
                                const htmlMatch = response.match(/```html:\s*([\s\S]*?)\s*```/);

                                const css = cssMatch ? cssMatch[1].trim() : "";
                                const html = htmlMatch ? htmlMatch[1].trim() : "";

                                return { css, html };
                            }

                            // Function to inject CSS into the page
                            function injectCssToPage(css) {
                                console.log("background.js: in inject css: ", css);
                                if (css != "") {
                                    saveMyChanges("myCss", css);
                                    const styleTag = document.createElement('style');
                                    styleTag.textContent = css;
                                    styleTag.setAttribute("data-injected", "true"); // Mark for removal if reset button is pressed
                                    document.head.appendChild(styleTag);

                                    // const element = document.getElementById("scrolling-text");
                                    // if (element) {
                                    //     element.innerText = "Fish"; // Modify the text content
                                    // }
                                }
                            }

                            // Function to inject HTML into the page
                            function injectHtmlToPage(html) {
                                console.log("background.js: in inject html: ", html);
                                if (html != "") {
                                    saveMyChanges("mtHtml", html);
                                    const tempContainer = document.createElement("div"); // Create a temporary container
                                    tempContainer.innerHTML = html; // Set the innerHTML to the generated content
                                    document.body.appendChild(tempContainer); // Append to the bottom of the page


                                }
                            }


                            // Function to process the response based on content type (HTML or CSS)
                            function processResponse(response) {
                                const { html, css } = extractHtmlAndCss(response);
                                injectHtmlToPage(html);
                                injectCssToPage(css);
                            }

                            // Call the processResponse function
                            processResponse(response);
                        },
                        args: [response],  // Pass the response as an argument to the function
                    });

                    //   sendResponse({ result: "Page modified" });
                } catch (error) {
                    console.error("background.js: error in sendRequestToBackend:", error);
                    //   sendResponse({ result: "Error modifying page" });
                }
            });
        });

        return true; // Indicates async response
    }
});







// function to send prompt, html, and css to server.js to make the gpt call
async function sendRequestToBackend(userMessage, html, css) {
    const maxLength = 6000; // max tokens

    try {
        console.log("background.js: sending request to backend with content");

        const response = await fetch('http://localhost:3000/get-gpt-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: userMessage,
                html: html.slice(0, maxLength), // Limit the HTML size
                css: css.slice(0, maxLength),   // Limit the CSS size
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error in response bg.js:", errorText);
            return ""; // Return early in case of error
        }

        console.log("background.js: received response from backend");

        const data = await response.json();
        console.log("background.js: parsed JSON response:", data);
        return data.response;

    } catch (error) {
        console.error("background.js: error in sendRequestToBackend:", error);
        return "";
    }
}


