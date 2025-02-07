// --- Declaraciones Globales ---
let parsedData = null; // Para uso reutilizable entre diferentes eventos
let cachedResponses = null; // Cache de las respuestas API
let listItems = []; // Global para reusar en Ctrl+M y Ctrl+X

function decodeHtmlEntities(str) {
  const element = document.createElement("div");
  element.innerHTML = str;
  return element.textContent;
}

function parseFormData(questions) {
  return questions.map((question) => {
    try {
      const formData = {
        text: "",
        description: "",
        options: [],
        imgUrl: question["img-url"],
        imgText: null,
        isCheckbox: false,
      };

      question = decodeHtmlEntities(question["data-params"]);

      const textMatch = question.match(/^\%\.\@\.\[\d+,"([^"]+)"/);
      if (textMatch) {
        formData.text = textMatch[1];
      }

      const descriptionMatch = question.match(/^\%\.\@\.\[\d+,"[^"]+","([^"]+)"/);
      if (descriptionMatch) {
        formData.description = descriptionMatch[1];
      }

      const optionsSection = question.match(/\[\[\d+,\[(.*?)\]\]\]/);
      if (optionsSection) {
        const optionsMatches = optionsSection[1].split(/],\[/);

        formData.options = optionsMatches
          .map((option) => {
            const match = option.match(/"([^"]+)"/);
            return match ? match[1] : null;
          })
          .filter((opt) => opt !== null);
      }

      return formData;
    } catch (error) {
      console.error("Error parsing question:", error);
      return {
        text: "",
        description: "",
        options: [],
        imgUrl: null,
        imgText: null,
        isCheckbox: false,
      };
    }
  });
}

function executeContentScript() {
  let form = document.querySelector("form");
  if (!form) {
    console.error("Form not found");
    return;
  }

  const questions = [];
  listItems = form.querySelectorAll('div[role="listitem"]'); // Asignar a la variable global

  listItems.forEach((item) => {
    const data = {
      "data-params": "",
      "img-url": null,
      "isCheckbox": false,
    };

    const questionDiv = item.querySelector("div[data-params]");
    const imgDiv = item.querySelector("img");

    // Verificar si es una pregunta de tipo "casillas de verificación"
    const checkboxInputs = item.querySelectorAll('div[role="checkbox"]');
    if (checkboxInputs.length > 0) {
      data.isCheckbox = true;
    }

    if (imgDiv) data["img-url"] = imgDiv.getAttribute("src");
    if (questionDiv) data["data-params"] = questionDiv.getAttribute("data-params");
    if (questionDiv || imgDiv) {
      questions.push(data);
    }
  });

  if (questions.length === 0) {
    console.error("No questions found");
    return;
  }

  parsedData = parseFormData(questions); // Guardar datos globalmente
  console.log("Parsed Data:", parsedData);

  // Agregar nota a preguntas de tipo "casillas de verificación"
  parsedData.forEach((question, index) => {
    if (questions[index].isCheckbox) {
      question.isCheckbox = true;
    }
  });

  const url = "https://google-forms-ashen.vercel.app";

  fetch(url + "/api/gemini/content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: parsedData }),
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((err) => {
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${err.error}`
          );
        });
      }
      return response.json();
    })
    .then((data) => {
      if (data.error) {
        console.error("API Error:", data.error);
        return;
      }
      console.log("API Response:", data);
      cachedResponses = data; // Guardar en memoria
      applyAnswers(data, parsedData, listItems); // Aplicar respuestas
    })
    .catch((error) => {
      console.error("Error making API call:", error.message);
    });
}

function applyAnswers(data, parsedData) {
    if (!data?.result || !parsedData?.length) {
      console.error("Invalid input data:", { data, parsedData });
      return;
    }
  
    parsedData.forEach((question, index) => {
      const response = data.result.find(
        (r) =>
          r?.fullQuestion?.trim().replace(/\s+/g, " ") ===
          question.text.trim().replace(/\s+/g, " ")
      );
  
      if (!response) return console.warn(`No match found for question ${index + 1}`);
  
      const answerTexts = Array.isArray(response.answer)
        ? response.answer.map((a) => a.trim())
        : [response.answer.trim()];
  
      answerTexts.forEach((answerText) => {
        const matchingOption = Array.from(document.querySelectorAll("label span")).find(
          (span) => span.textContent.trim() === answerText
        );
  
        if (matchingOption && !matchingOption.textContent.includes("+")) {
          // Crear el signo "+" con estilo blanco
          const plusSpan = document.createElement("span");
          plusSpan.textContent = " +";
          plusSpan.style.color = "white"; // Asignar estilo de color blanco
  
          // Agregar el signo "+" al texto existente
          matchingOption.appendChild(plusSpan);
          console.log(`Marked correct answer: "${answerText}"`);
        }
      });
    });
  
    console.log("applyAnswers completed");
  }

document.addEventListener("keydown", function (event) {
  if (event.ctrlKey && event.key === "c") {
    executeContentScript(); // Ejecutar el script con Ctrl+C
  } else if (event.ctrlKey && event.key === "m") {
    // Remove '+' marks con Ctrl+M
    listItems.forEach((item) => {
      const optionElements = item.querySelectorAll("label span");
      optionElements.forEach((optEl) => {
        optEl.textContent = optEl.textContent.replace(/ \+$/, "").trim(); // Eliminar "+"
      });
    });
  } else if (event.ctrlKey && event.key === "x") {
    // Restaurar con Ctrl+X
    if (cachedResponses && parsedData) {
      applyAnswers(cachedResponses, parsedData, listItems); // Reaplicar respuestas cacheadas
    } else {
      console.warn("No cached data to restore answers");
    }
  }
});