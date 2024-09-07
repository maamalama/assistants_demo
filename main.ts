import { randomUUID } from "crypto";
import OpenAI from "openai";
import fs from "fs";

const openaiApiKey = "";
const HELICONE_API_KEY = "";

async function defaultRequestProdAssistant() {
  const session = randomUUID();
  const openai = new OpenAI({
    apiKey: HELICONE_API_KEY,
    baseURL: `https://oai.helicone.ai/v1/${HELICONE_API_KEY}`,
  });

  const assistant = await openai.beta.assistants.create(
    {
      name: "VisaCalculator",
      instructions:
        "You are a visa application advisor with calculation capabilities. Provide information on visa processes and perform calculations related to visa fees, stay duration, and application processing times.",
      tools: [{ type: "code_interpreter" }],
      model: "gpt-4o",
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator",
        "Helicone-Session-Name": "VisaCalculation",
      },
    }
  );

  const thread = await openai.beta.threads.create();

  const message = await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "user",
      content:
        "If a Schengen visa costs €80 and I'm staying for 15 days, what's my daily visa cost? Round to 2 decimal places.",
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator/cost-calculation",
        "Helicone-Session-Name": "VisaCalculation",
      },
    }
  );

  let run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: assistant.id,
      instructions:
        "Use the code interpreter to perform calculations. Provide a detailed explanation of the calculation process. Address the user as Valued Applicant.",
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator/cost-calculation/polling",
        "Helicone-Session-Name": "VisaCalculation",
      },
    }
  );

  if (run.status === "completed") {
    const messages = await openai.beta.threads.messages.list(
      thread.id,
      {
        run_id: run.id,
      },
      {
        headers: {
          "Helicone-Session-Id": session,
          "Helicone-Session-Path": "/visa-calculator/cost-calculation/result",
          "Helicone-Session-Name": "VisaCalculation",
        },
      }
    );
    for (const message of messages.data.reverse()) {
      console.log(`${message.role} > ${JSON.stringify(message.content[0])}`);
    }
  } else {
    console.log(run.status);
  }
}

async function VisaApprovalCheckererAssistant() {
  const session = randomUUID();
  const openai = new OpenAI({
    apiKey: openaiApiKey,
    baseURL: `https://oai.helicone.ai/v1/${HELICONE_API_KEY}`,
  });

  const assistant = await openai.beta.assistants.create(
    {
      name: "Visa Approval Checker",
      instructions:
        "You are an expert visa application analyzer. Use your knowledge base to assess visa applications and provide insights on approval likelihood.",
      model: "gpt-4o",
      tools: [{ type: "file_search" }],
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-checker/create",
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  let vectorStore = await openai.beta.vectorStores.create(
    {
      name: "Visa Application Documents",
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": `/visa-checker/assistant/vectorStore`,
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  await openai.beta.assistants.update(
    assistant.id,
    {
      tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": `/visa-checker/assistant/update`,
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  const visaApplication = await openai.files.create({
    purpose: "assistants",
    file: fs.createReadStream("./visa_application.pdf"),
  });

  const thread = await openai.beta.threads.create(
    {
      messages: [
        {
          role: "user",
          content:
            "What's the likelihood of this visa application being approved? Please provide a detailed analysis.",
          attachments: [
            { file_id: visaApplication.id, tools: [{ type: "file_search" }] },
          ],
        },
      ],
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": `/visa-checker/assistant/threads/fileSearch`,
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  console.log(thread.tool_resources?.file_search);

  const run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: assistant.id,
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": `/visa-checker/assistant/threads/polling`,
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  const messages = await openai.beta.threads.messages.list(
    thread.id,
    {
      run_id: run.id,
    },
    {
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": `/visa-checker/assistant/threads/messages`,
        "Helicone-Session-Name": "VisaApprovalChecker",
      },
    }
  );

  const message = messages.data.pop()!;
  if (message.content[0].type === "text") {
    const { text } = message.content[0];
    const { annotations } = text;
    const citations: string[] = [];

    let index = 0;
    for (let annotation of annotations) {
      text.value = text.value.replace(annotation.text, "[" + index + "]");
      // @ts-ignore
      const { file_citation } = annotation;
      if (file_citation) {
        const citedFile = await openai.files.retrieve(file_citation.file_id);
        citations.push("[" + index + "]" + citedFile.filename);
      }
      index++;
    }

    console.log("Visa Application Analysis:");
    console.log(text.value);
    console.log("\nCitations:");
    console.log(citations.join("\n"));
  }
}

VisaApprovalCheckererAssistant();
