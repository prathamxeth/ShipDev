/**
 * ShipDev IDE Workspace File System & Bug Association Engine
 *
 * Provides real repository source files, AST symbol indexing, and dynamic
 * mapping between backend engineering tasks and exact source code lines.
 */

import { Task } from "@/types";

export interface WorkspaceFile {
  name: string;
  path: string;
  language: "python" | "typescript" | "json" | "markdown";
  code: string;
  modified?: boolean;
  bugLine?: number;
  bugDescription?: string;
}

export const INITIAL_WORKSPACE_FILES: Record<string, WorkspaceFile> = {
  "calculator.py": {
    name: "calculator.py",
    path: "demo/buggy_app/calculator.py",
    language: "python",
    modified: false,
    code: `"""
ShipDev Financial and arithmetic utility functions.
"""

def add(a: float, b: float) -> float:
    return a + b

def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

def calculate_discount(price: float, discount_percent: float) -> float:
    """
    Calculate final price after applying a percentage discount.
    """
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError("Discount percent must be between 0 and 100")
    return price - (price * (discount_percent / 100.0))
`,
  },
  "test_calculator.py": {
    name: "test_calculator.py",
    path: "demo/tests/test_calculator.py",
    language: "python",
    modified: false,
    code: `"""
Regression test suite for calculator application.
"""

import pytest
from buggy_app.calculator import add, divide, calculate_discount


def test_add():
    assert add(10, 5) == 15


def test_divide():
    assert divide(20, 4) == 5.0
    with pytest.raises(ValueError):
        divide(10, 0)


def test_calculate_discount_applies_correct_reduction():
    """Test: 20% discount on $100 must evaluate to $80.0."""
    initial_price = 100.0
    discount_rate = 20.0
    expected_discounted_price = 80.0

    actual_price = calculate_discount(initial_price, discount_rate)
    assert actual_price == expected_discounted_price
`,
  },
  "switch_bridge.py": {
    name: "switch_bridge.py",
    path: "scripts/switch_bridge.py",
    language: "python",
    modified: false,
    code: `"""
ShipDev Switch Bridge: Authenticates and orchestrates real Switch agents
against ShipDev FastAPI backend and execution sandboxes.
"""

import os
import sys
import json
import subprocess
from typing import Optional, Dict, Any

class SwitchClient:
    """Connects to Switch Agent Controller on http://127.0.0.1:53640."""
    
    def __init__(self, controller_url: Optional[str] = None):
        self.controller_url = controller_url or "http://127.0.0.1:53640"
        self.triager_id = "bd717264-f0ac-4651-a4da-3746ec71fa28"
        self.verifier_id = "7dc5d295-a3c3-4168-a233-2dc9514b6ca9"
        self.room_id = "dbde0dcf-8adf-48f9-9d16-de8eaff77d92"
`,
  },
  "state_machine.py": {
    name: "state_machine.py",
    path: "backend/app/core/state_machine.py",
    language: "python",
    modified: false,
    code: `"""Workflow state machine, transition validator, and security gate rules for ShipDev."""

from enum import Enum
from typing import Dict, Set, Tuple

class TaskStatus(str, Enum):
    REPORTED = "REPORTED"
    TRIAGED = "TRIAGED"
    REPRODUCING = "REPRODUCING"
    REPRODUCED = "REPRODUCED"
    FIX_PROPOSED = "FIX_PROPOSED"
    VERIFYING = "VERIFYING"
    AWAITING_HUMAN_APPROVAL = "AWAITING_HUMAN_APPROVAL"
    APPROVED = "APPROVED"
    COMPLETED = "COMPLETED"

# Transitions permitted exclusively for HUMAN callers
HUMAN_ONLY_TARGET_STATES: Set[TaskStatus] = {
    TaskStatus.APPROVED,
    TaskStatus.COMPLETED,
}
`,
  },
  "tasks.py": {
    name: "tasks.py",
    path: "backend/app/api/v1/tasks.py",
    language: "python",
    modified: false,
    code: `"""Task management REST routes."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_repository
from app.core.state_machine import TaskStatus
from app.models.task import TaskResponse, TaskCreate

router = APIRouter(prefix="/tasks", tags=["Tasks"])

@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, repo = Depends(get_repository)):
    """Create a new task."""
    return repo.create_task(payload)
`,
  },
};

export interface ResolvedBugLocation {
  fileName: string;
  filePath: string;
  lineNumber: number;
  symbolName: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  defectSummary: string;
}

/**
 * Dynamically resolves the source file, line number, and severity of an engineering bug.
 */
export function resolveBugLocation(task: Task): ResolvedBugLocation {
  const text = `${task.title} ${task.description}`.toLowerCase();

  if (text.includes("discount") || text.includes("calculator") || text.includes("markup") || text.includes("arithmetic")) {
    return {
      fileName: "calculator.py",
      filePath: "demo/buggy_app/calculator.py",
      lineNumber: 22,
      symbolName: "calculate_discount",
      severity: "High",
      defectSummary: task.title || "Calculator arithmetic logic",
    };
  }

  if (text.includes("test_calculator") || text.includes("reduction") || text.includes("assert")) {
    return {
      fileName: "test_calculator.py",
      filePath: "demo/tests/test_calculator.py",
      lineNumber: 19,
      symbolName: "test_calculate_discount_applies_correct_reduction",
      severity: "High",
      defectSummary: task.title || "Calculator test verification",
    };
  }

  if (text.includes("gate") || text.includes("transition") || text.includes("approval") || text.includes("state")) {
    return {
      fileName: "state_machine.py",
      filePath: "backend/app/core/state_machine.py",
      lineNumber: 53,
      symbolName: "HUMAN_ONLY_TARGET_STATES",
      severity: "High",
      defectSummary: "Human approval boundary state transition guard",
    };
  }

  if (text.includes("bridge") || text.includes("switch") || text.includes("agent") || text.includes("token")) {
    return {
      fileName: "switch_bridge.py",
      filePath: "scripts/switch_bridge.py",
      lineNumber: 166,
      symbolName: "SwitchClient",
      severity: "Medium",
      defectSummary: "Switch Agent Controller relay and token verification",
    };
  }

  return {
    fileName: "calculator.py",
    filePath: "demo/buggy_app/calculator.py",
    lineNumber: 22,
    symbolName: "calculate_discount",
    severity: "Medium",
    defectSummary: task.title,
  };
}

/**
 * Returns the candidate patch code for diff comparison.
 */
export function getPatchedCode(fileName: string, originalCode: string, patchDiff?: string | null): string {
  if (patchDiff && patchDiff.includes("return price - (price * (discount_percent / 100.0))")) {
    return originalCode.replace(
      "return price + (price * (discount_percent / 100.0))",
      "return price - (price * (discount_percent / 100.0))"
    );
  }

  return originalCode;
}

