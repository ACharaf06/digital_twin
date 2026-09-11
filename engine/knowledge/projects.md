# Projects

## LCP Configuration Chatbot (Amadeus)
RAG + function-calling assistant for the Amadeus loyalty platform. Built solo as a
POC, then taken toward production inside the OctoMind team. The first version was
RAG over the product's Confluence pages; version 2 replaced that with a hybrid
approach — documentation generated from the code, plus function calling to read
live configuration values.
Tags: RAG, function calling, LangGraph, Azure OpenAI.

## Member Insight (Amadeus)
An agent that reads a loyalty member's record the moment a call-centre agent opens
it: a condensed snapshot, a prediction of why the member is calling (with a
confidence level and a justification), a recommended next action, and a chat
assistant for questions about the member's point history. Evidence is computed
deterministically in code; only the judgement calls go to a model. Deployed to
test environments behind a feature flag.
Tags: A2A, MCP, Azure OpenAI, Redis, agent orchestration.

## SaaSOffice — multi-purpose chatbots
Built and deployed the client-facing and staff-facing assistants during the 2025
internship, including qualification of incoming users and quantitative analysis
over the portfolio.
Tags: LLM agents, chatbot, product integration.

## Professional thesis — AI-native decision systems
*From Descriptive Business Intelligence to AI-Native Decision Systems: World
Models, Ontologies, and Decision Intelligence.* Written in French for the Mastère
Spécialisé, built on interviews with practitioners.
Tags: decision intelligence, world models, ontologies, BI.

## Live Anime Style Transfer
Real-time webcam anime style transfer with Naruto hand-sign recognition to switch
modes. AnimeGANv2 in PyTorch on Apple Silicon (MPS), MediaPipe for hand landmarks.
A high-visual-impact, creative engineering project.
Tags: AnimeGANv2, PyTorch / MPS, MediaPipe, Real-time.

## This portfolio (Digital Twin)
A React/TypeScript studio centered on an articulated Three.js cartoon mascot
and an always-visible conversation. The original cartoon portrait provides
the facial texture and 478 detected face landmarks; the face surface extends
into a closed volumetric head, sculpted curls, body, and jointed limbs.
The mascot follows the pointer, blinks, reacts while listening and thinking,
animates its mouth during replies, waves, dances, jumps, and spins. Visitors
can orbit the actual 3D geometry. The body and back of the head are modeled
approximations, not a scan. Voice uses optional browser speech synthesis;
mouth movement is expressive animation, not phoneme-accurate lip sync.
Frontend: Vite, React, Three.js. Backend: a local Ollama model answering over a
retrieval index built from Charaf's own reports and thesis, streamed through a
Node HTTP server. When the engine is unavailable, the interface clearly labels
its scripted Profile preview.
