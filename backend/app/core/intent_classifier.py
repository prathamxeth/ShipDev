"""Universal Intent Classifier for categorizing user prompts across 5 extensible categories."""

import re
from typing import Any, Dict, List, Tuple
from pydantic import BaseModel, Field
from app.models.platform import TaskCategory


class IntentClassificationResult(BaseModel):
    category: TaskCategory
    confidence: float = Field(..., ge=0.0, le=1.0)
    title: str
    summary: str
    entities: Dict[str, Any] = Field(default_factory=dict)
    matched_keywords: List[str] = Field(default_factory=list)


# Category keyword profiles and weightings
CATEGORY_PROFILES: Dict[TaskCategory, Dict[str, float]] = {
    TaskCategory.ENGINEERING: {
        "bug": 2.0,
        "fix": 2.0,
        "error": 2.0,
        "exception": 2.0,
        "defect": 2.0,
        "failing": 1.8,
        "traceback": 2.0,
        "crash": 1.8,
        "broken": 1.5,
        "patch": 1.8,
        "test": 1.5,
        "regression": 2.0,
        "zerodivisionerror": 2.5,
        "valueerror": 2.0,
        "typeerror": 2.0,
        "discount": 1.5,
        "calculator": 1.5,
        "refactor": 1.4,
        "syntax": 1.8,
    },
    TaskCategory.RESEARCH: {
        "research": 2.5,
        "investigate": 1.8,
        "survey": 2.0,
        "compare": 1.8,
        "evaluate": 1.6,
        "benchmark": 1.5,
        "options": 1.4,
        "library": 1.4,
        "framework": 1.4,
        "alternatives": 1.8,
        "how does": 1.6,
        "explore": 1.5,
        "best practices": 1.8,
    },
    TaskCategory.PLANNING: {
        "plan": 2.5,
        "roadmap": 2.0,
        "milestone": 1.8,
        "sprint": 1.8,
        "timeline": 1.8,
        "schedule": 1.8,
        "coordinate": 1.6,
        "breakdown": 1.8,
        "steps": 1.4,
        "dependencies": 1.8,
        "phases": 1.6,
        "architecture": 1.5,
    },
    TaskCategory.WRITING: {
        "document": 2.2,
        "docs": 2.0,
        "write": 1.8,
        "readme": 2.2,
        "changelog": 2.0,
        "release notes": 2.2,
        "guide": 1.8,
        "tutorial": 1.8,
        "summarize": 1.6,
        "specs": 1.8,
        "documentation": 2.2,
        "explain": 1.4,
    },
    TaskCategory.ANALYSIS: {
        "analyze": 2.5,
        "analysis": 2.5,
        "diagnose": 2.0,
        "performance": 1.8,
        "bottleneck": 2.0,
        "profiling": 2.0,
        "latency": 1.8,
        "logs": 1.6,
        "metrics": 1.6,
        "audit": 1.8,
        "security": 1.6,
        "vulnerability": 2.0,
    },
}


class UniversalIntentClassifier:
    """Classifies user chat messages into universal task categories with entity extraction."""

    def classify(self, message_text: str) -> IntentClassificationResult:
        text = message_text.strip().lower()
        if not text:
            return IntentClassificationResult(
                category=TaskCategory.ENGINEERING,
                confidence=0.5,
                title="Unspecified Request",
                summary="No prompt provided.",
                entities={},
                matched_keywords=[],
            )

        # 1. Score across categories
        category_scores: Dict[TaskCategory, float] = {c: 0.0 for c in TaskCategory}
        category_matches: Dict[TaskCategory, List[str]] = {c: [] for c in TaskCategory}

        for cat, keywords in CATEGORY_PROFILES.items():
            for kw, weight in keywords.items():
                if kw in text:
                    category_scores[cat] += weight
                    category_matches[cat].append(kw)

        # Select highest scoring category (defaulting to ENGINEERING if tied at 0)
        best_cat = max(category_scores, key=lambda c: category_scores[c])
        max_score = category_scores[best_cat]

        confidence = min(0.95, 0.5 + (max_score * 0.1)) if max_score > 0 else 0.5

        # 2. Extract Entities (filenames, line numbers, error types)
        entities = self._extract_entities(message_text)

        # 3. Generate concise Title and Summary
        title = self._generate_title(best_cat, message_text, entities)
        summary = message_text.strip()
        if len(summary) > 200:
            summary = summary[:197] + "..."

        return IntentClassificationResult(
            category=best_cat,
            confidence=round(confidence, 2),
            title=title,
            summary=summary,
            entities=entities,
            matched_keywords=category_matches[best_cat],
        )

    def _extract_entities(self, text: str) -> Dict[str, Any]:
        entities: Dict[str, Any] = {}

        # Filename regex (e.g. calculator.py, test_app.py, README.md)
        files = re.findall(r"\b[\w\-_/]+\.(?:py|tsx|ts|js|jsx|json|md|yaml|yml|html|css)\b", text, re.IGNORECASE)
        if files:
            entities["files"] = list(set(files))

        # Line number regex (e.g. line 22, Ln 45, :22)
        lines = re.findall(r"(?:line|ln|:)\s*(\d+)", text, re.IGNORECASE)
        if lines:
            entities["line_numbers"] = [int(n) for n in lines]

        # Python exception regex (e.g. ZeroDivisionError, ValueError)
        errors = re.findall(r"\b[A-Z][a-zA-Z]*(?:Error|Exception|Warning|Failure)\b", text)
        if errors:
            entities["errors"] = list(set(errors))

        # URL regex
        urls = re.findall(r"https?://[^\s]+", text)
        if urls:
            entities["urls"] = urls

        return entities

    def _generate_title(self, category: TaskCategory, text: str, entities: Dict[str, Any]) -> str:
        clean = re.sub(r"<[^>]+>", "", text).strip()
        first_line = clean.split("\n")[0].strip()

        # If specific error and file found, format crisp title
        if entities.get("errors") and entities.get("files"):
            return f"Resolve {entities['errors'][0]} in {entities['files'][0]}"
        if entities.get("files"):
            return f"{category.value.capitalize()}: {entities['files'][0]}"

        if len(first_line) > 70:
            return first_line[:67] + "..."
        return first_line or f"{category.value.capitalize()} Request"
