"""Pytest global configuration and test environment credentials."""

import os

# Set explicit test credentials before any test module imports application configuration
os.environ["ENVIRONMENT"] = "test"
os.environ["API_SECRET_KEY"] = "test-agent-secret-key-12345"
os.environ["HUMAN_APPROVAL_SECRET"] = "test-human-approval-secret-key-12345"
os.environ["HUMAN_OPERATOR_IDENTITY"] = "shipdev-operator"

