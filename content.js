//update span counter
async function updateCounter(newCount) {
    chrome.storage.local.set({ "spanCounter": newCount }, () => {
        // console.log(`Counter updated to: ${newCount}`);
    });
}

//get span counter from local storage
async function getCounter() {
    return new Promise((resolve) => {
        chrome.storage.local.get("spanCounter", (result) => {
            resolve(result.spanCounter || 0); // Default to 0 if no counter is found
        });
    });
}

async function setFocusEnd(userInput) {
    const length = userInput.textContent.length;
    userInput.focus();
    // console.log("span length", length);

    // Create a range and set the selection to the end
    const range = document.createRange();
    const selection = window.getSelection();

    // Set range to the end of the text in the span
    range.setStart(userInput.firstChild || userInput, length); // Focus at the end of the text
    range.setEnd(userInput.firstChild || userInput, length);

    // Clear any existing selections and apply the new range
    selection.removeAllRanges();
    selection.addRange(range);

    // console.log("Setting focus on the end of the span");
}

// Listener for when the user hits enter
async function handleEnterKeyPress(shadowRoot) {
    // Get the current counter (await because it's asynchronous)
    const currentCount = await getCounter();
    // console.log("handle enter key count: ",currentCount);

    // Find the user input element with the dynamically generated ID
    const userInput = shadowRoot.getElementById(`input-${currentCount}`);

    //set focus to end (it works!!!! :D)
    userInput.textContent = userInput.textContent.trim();
    setFocusEnd(userInput);  

    if (userInput) {

        userInput.addEventListener("keydown", async (event) => {
            if (event.key === "Enter") {
                // console.log("Enter key pressed");

                const userPrompt = userInput.textContent.trim();

                if (userPrompt.length > 0 && userPrompt != null) {
                    // increment id count
                    const newCount = currentCount + 1;
                    updateCounter(newCount);
                    // console.log("new count:", newCount);

                    // Log the prompt to be sent (e.g., to an LLM)
                    console.log("Prompt to be sent to LLM: ", userPrompt);

                    if(userPrompt != "I want to change..."){    //only call LLM if user has added to prompt

                        callGPT(userPrompt);    //WHERE LLM IS ACTUALLY CALLED, send prompt with it
                    }

                    // Add a new span after the current one (to put in next prompt)
                    const container = shadowRoot.getElementById("popup-input-box");
                    container.innerHTML += `<p><span id="input-${newCount}" class="user-input" role="textbox" contenteditable>I want to change...</span></p>`;

                    // Set the focus to the newly created span
                    const newInput = shadowRoot.getElementById(`input-${newCount}`);
                    setFocusEnd(newInput);  

                    handleEnterKeyPress(shadowRoot);  // re-apply the event listener to the new span
                }
                else{
                    //print out something to screen to say to write a prompt?
                    console.log("Please write something in the input box.");
                }
            }
        });
    } else {    //no user input entered - put message to write something here
        console.error(`Element with id 'input-${currentCount}' not found.`);
    }
}

function makePopupDraggable(popup) {
    let isDragging = false;
    let offsetX, offsetY;

    // When mouse is down on the popup, start the dragging process
    popup.addEventListener("mousedown", (e) => {
        isDragging = true;

        // Calculate the initial offset of the mouse from the popup's top-left corner
        offsetX = e.clientX - popup.getBoundingClientRect().left;
        offsetY = e.clientY - popup.getBoundingClientRect().top;

        // Add a class for visual feedback if desired
        popup.style.cursor = "move";
    });

    // When the mouse is moving, update the popup's position
    window.addEventListener("mousemove", (e) => {
        if (isDragging) {
            // Calculate the new position
            const left = e.clientX - offsetX;
            const top = e.clientY - offsetY;

            // Set the new position of the popup
            popup.style.position = "fixed"; // This makes it stay in the viewport
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        }
    });

    // When mouse is up, stop dragging
    window.addEventListener("mouseup", () => {
        isDragging = false;
        popup.style.cursor = "default";
    });
}


// Creates popup
function makePopup() {
    // Create the shadow host
    const shadowHost = document.createElement("div");
    shadowHost.id = "popup-container";
    document.body.appendChild(shadowHost);

    // Attach shadow DOM
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    // Load and inject popup HTML
    fetch(chrome.runtime.getURL("popup.html"))
        .then(response => response.text())
        .then(html => {
            // console.log("HTML fetched and injected.");

            // Create a wrapper div inside the Shadow DOM
            const popupWrapper = document.createElement("div");

            // Load external CSS inside the Shadow DOM
            const styleElement = document.createElement("link");
            styleElement.rel = "stylesheet";
            styleElement.href = chrome.runtime.getURL("styles.css");

            // Insert CSS and HTML into the Shadow DOM
            popupWrapper.innerHTML = html;
            shadowRoot.appendChild(styleElement); // Add the CSS
            shadowRoot.appendChild(popupWrapper); // Add the HTML content

            chrome.storage.local.set({ popupState: "open" });

            // Add close button 
            shadowRoot.getElementById("close-popup").addEventListener("click", () => {
                chrome.storage.local.set({ popupState: "closed" });
                shadowHost.remove();
                console.log("popup is false");
            });

            // Add reset button - clearing savedchanges in Chrome storage
            shadowRoot.getElementById("reset-popup").addEventListener("click", () => {
                resetChanges();
            });

            // Add popup functions
            makePopupDraggable(shadowHost);

            // Initialize counter
            updateCounter(0);

            setFocusEnd(shadowRoot.getElementById("input-0")); // Set focus to end of text span

            handleEnterKeyPress(shadowRoot); // Event listener to make new span when enter key is pressed

        })  
        .catch(error => console.error("Error injecting popup:", error)); // Handle errors
}  



// WHAT IS ACTUALLY RUN //

// THE ONLY THING THAT IS ACTUALLY CALLED //
restorePopupIfNeeded(); // makes popup if it was open on previous page

////////////////////////////

async function restorePopupIfNeeded() {
    const data = await chrome.storage.local.get("popupState");
    if (data.popupState === "open" && !document.getElementById("popup-container")) { //if popup should be open and is not open now, open it, also apply saved changes
        makePopup();
        getSavedChanges(); 
        console.log("making popup");
    }
    else{   //if popup should not be open, apply saved changes without opening it
        getSavedChanges();  //something is going wrong with saved changes across pages and css/html injection - look into this
        console.log("applying saved changes because popup doesn't need to be opened");
    }
}

// // reset all changes (for current website)
function resetChanges() {
    const currentDomain = window.location.hostname;

    chrome.storage.local.get(["savedChanges"], (data) => {
        let savedChanges = data.savedChanges || {};

        if (savedChanges[currentDomain]) {
            delete savedChanges[currentDomain]; // Remove changes for the current site
        }

        chrome.storage.local.set({ savedChanges }, () => {
            console.log(`Modifications for ${currentDomain} have been cleared!`);
            location.reload(); // Reload the page to remove changes
        });
    });
}




// cal openai with user message
function callGPT(userMessage) {
    // console.log("call GPT function in content.js user message:", userMessage);

    chrome.runtime.sendMessage({ action: "modifyPage", message: userMessage });
    console.log("call to ai goes here");
}


  //save changes to chrome storage they persist across pages (called in background.js)
  function saveMyChanges(codeType, code) {
    const currentDomain = window.location.hostname; // Get the domain (e.g., "example.com")

    chrome.storage.local.get(["savedChanges"], (data) => {
        let savedChanges = data.savedChanges || {}; // Retrieve existing saved changes

        // Store changes under the domain
        if (!savedChanges[currentDomain]) {
            savedChanges[currentDomain] = {};
        }
        // savedChanges[currentDomain][codeType] = code; // Save HTML or CSS changes

        if (savedChanges[currentDomain][codeType]) {
            // If the code type already exists, append the new code to the existing code
            savedChanges[currentDomain][codeType] += `\n${code}`; // Append the new change
        } else {
            // If the code type doesn't exist, just set the new code
            savedChanges[currentDomain][codeType] = code;
        }

        // Save back to storage
        chrome.storage.local.set({ savedChanges }, () => {
            console.log(`Modifications saved for ${currentDomain}!`);
        });
    });
}




//apply saved changes across pages
function getSavedChanges() {
    const currentDomain = window.location.hostname; // Get current domain

    chrome.storage.local.get(["savedChanges"], (data) => {
        let savedChanges = data.savedChanges || {}; // Retrieve saved modifications
        let domainChanges = savedChanges[currentDomain]; // Get changes for this domain

        if (domainChanges) {
            if (domainChanges.myHtml) {
                injectHtmlToPage(domainChanges.myHtml);
                console.log("injected html");
            }
            if (domainChanges.myCss) {
                injectCssToPage(domainChanges.myCss);
                console.log("injected css");
            }
        } else {
            console.log(`No saved modifications for ${currentDomain}.`);
        }
    });
}




  //CLEAN AND INJECT RESPONSE

//   function extractHtmlAndCss(response) {
//     let cleanedResponse = response
//         .replace(/```css:/g, '')   // Remove ```css:
//         .replace(/```html:/g, '')  // Remove ```html:
//         .replace(/```/g, '')       // Remove all triple backticks
//         .trim();

//     let extractedCss = "";
//     let extractedHtml = "";

//     // Extract CSS
//     const cssMatch = cleanedResponse.match(/(\.|\#)[^{]+\{[^}]+\}/gs);
//     console.log("cssMatch",cssMatch);
//     if (cssMatch) {
//         extractedCss = cssMatch.join("\n"); // Combine multiple CSS rules if present
//         cleanedResponse = cleanedResponse.replace(cssMatch.join("\n"), "").trim(); 
//         saveMyChanges("myCss", extractedCss);
//         console.log("extractedCss", extractedCss);
//     }

//     // Whatever remains is HTML
//     extractedHtml = cleanedResponse.trim();
//     if (extractedHtml != ""){
//         saveMyChanges("myHtml", extractedHtml);
//         console.log("extractedHtml", extractedHtml);
//     }
    

//     return { html: extractedHtml, css: extractedCss };
// }

// Function to inject CSS into the page
function injectCssToPage(css) {
    console.log("in inject css");
    if (css != ""){
        const styleTag = document.createElement('style');
        styleTag.textContent = css;
        styleTag.setAttribute("data-injected", "true"); // Mark for removal if reset button is pressed
        document.head.appendChild(styleTag);
    }
}

// Function to inject HTML into the page
function injectHtmlToPage(html) {
    console.log("in inject html");
    if (html != ""){
        console.log("html not null");
    const tempContainer = document.createElement("div"); // Create a temporary container
    tempContainer.innerHTML = html; // Set the innerHTML to the generated content
    document.body.appendChild(tempContainer); // Append to the bottom of the page
    }
}


// // Function to process the response based on content type (HTML or CSS)
// function processResponse(response) {
//     const { html, css } = extractHtmlAndCss(response);
//     injectHtmlToPage(html);
//     injectCssToPage(css);
// }








// // Function to clean the response
// function extractHtmlAndCss(response) {
//     let cleanedResponse = response
//         .replace(/```css:/g, '')   // Remove ```css:
//         .replace(/```html:/g, '')  // Remove ```html:
//         .replace(/```/g, '')       // Remove all triple backticks
//         .trim();

//     let extractedCss = "";
//     let extractedHtml = "";

//     // Extract CSS
//     const cssMatch = cleanedResponse.match(/(\.|\#)[^{]+\{[^}]+\}/gs);
//     console.log("cssMatch",cssMatch);
//     if (cssMatch) {
//         extractedCss = cssMatch.join("\n"); // Combine multiple CSS rules if present
//         cleanedResponse = cleanedResponse.replace(cssMatch.join("\n"), "").trim(); // Remove CSS from response
//         console.log("extractedCss", extractedCss);
//     }

//     // Whatever remains is HTML
//     extractedHtml = cleanedResponse.trim();
//     console.log("extractedHtml", extractedHtml);

//     return { html: extractedHtml, css: extractedCss };
// }

//   // Function to inject CSS into the page
//   function injectCssToPage(css) {
//     const styleTag = document.createElement('style');
//     styleTag.textContent = css;
//     styleTag.setAttribute("data-injected", "true"); // Mark for removal if reset button is pressed
//     document.head.appendChild(styleTag);
//   }
  
//   // Function to inject HTML into the page
//   function injectHtmlToPage(html) {
//     if (html != ""){    //only inject if there is html to inject
//     document.body.innerHTML = html;
//   }
//   }
  
// //   // Function to check if the response is HTML
// //   function isHtml(response) {
// //     return response.trim().startsWith('<html>') || response.trim().startsWith('<!DOCTYPE html>');
// //   }
  
//   // Function to process the response based on content type (HTML or CSS)
//   function processResponse(response) {
//     const {html, css} = extractHtmlAndCss(response);
//       injectHtmlToPage(html);         
//       injectCssToPage(css);
//  }
  
  
  





































            // function updateCursorPosition() {
            //     const placeholder = shadowRoot.getElementById("user-input");
            
            //     // Check if the custom caret div exists; if not, create it
            //     let cursor = placeholder.querySelector(".custom-caret");
            //     if (!cursor) {
            //         cursor = document.createElement("div");
            //         cursor.classList.add("custom-caret");
            //         placeholder.appendChild(cursor);
            //         console.log("custom caret baybee");
            //     }
            
            //     // Create a range and selection
            //     const selection = window.getSelection();
            //     const range = selection.getRangeAt(0);  // Get the current selection range
                
            //     // Get the caret position relative to the viewport
            //     const rect = range.getBoundingClientRect();
            //     console.log(rect);
            
            //     // Set the custom caret position at the end of the current selection (where the default caret would be)
            //     cursor.style.top = `${rect.top}px`;  // Vertical position
            //     cursor.style.left = `${rect.left}px`;  // Horizontal position

            //     console.log("custom caret set");
            //     console.log(rect.top, rect.left);
            // }

            // // Update the cursor position whenever the user types or focuses
            // placeholder.addEventListener("input", updateCursorPosition);
            // placeholder.addEventListener("focus", updateCursorPosition);
