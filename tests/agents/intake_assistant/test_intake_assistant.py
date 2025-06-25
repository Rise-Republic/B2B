You're seeing two distinct test failures in your intake_assistant agent tests:

🧪 Failure 1: test_check_existing_projects_found
✅ What’s expected:
If similar projects are found via search_nodes, the agent should fail the intake process to avoid duplicates.

❌ What’s happening:
The agent continues processing and completes successfully — AgentStatus.COMPLETED.

🧠 Likely cause:
The _check_existing_projects() logic isn't terminating or short-circuiting the intake when duplicates are found.

✅ Fix:
Ensure your agent returns early with AgentStatus.FAILED if search_nodes() yields similar project names.

You probably want logic like this inside execute() or a helper:

python
Copy
Edit
existing = await self.mcp_client.search_nodes(query=inputs["project_name"])
if existing:
    return AgentResult(
        status=AgentStatus.FAILED,
        error_details="Similar project(s) already exist.",
        data={"similar_projects": existing}
    )
🧪 Failure 2: test_check_existing_projects_not_found
✅ What’s expected:
Agent completes intake successfully, and search_nodes should be called once with the expected query.

❌ What’s happening:
The mock assertion fails — search_nodes() was never called.

🧠 Likely cause:
The logic to check for duplicates isn’t executed at all during the run. This could happen if:

_check_existing_projects() isn’t being invoked inside execute()

Or the call isn’t passing project_name into search_nodes(query=...)

Or the logic is gated behind a condition not being met

✅ Fix:
Make sure you're actually invoking search_nodes() in your agent logic — something like:

python
Copy
Edit
async def _check_existing_projects(self, project_name: str):
    return await self.mcp_client.search_nodes(query=project_name)
And that this is being used early in execute():

python
Copy
Edit
existing = await self._check_existing_projects(inputs["project_name"])
Then the test can pass as expected and the mock assertion will succeed.

✅ Suggested Next Steps
Review the agent’s execute() method: Ensure _check_existing_projects() is called at the top with the project name.

Ensure early return on match: if duplicates are found, the agent should return AgentResult(status=AgentStatus.FAILED, ...)

Ensure test mocks align:

mock_mcp_client.search_nodes.assert_called_once_with(query=...) should reflect actual agent usage.

You may want to log the query string actually used inside the agent to confirm matching.

import pytest
from unittest.mock import AsyncMock, MagicMock
from agents.intake_assistant.main import IntakeAssistantAgent
from agents.core.agent_base import AgentStatus
from agents.utils.validation import ValidationResult
import logging

# Configure logging for tests
logging.basicConfig(level=logging.INFO)

@pytest.fixture
def mock_mcp_client():
    """Fixture for a mock MCPClient."""
    client = MagicMock()
    client.create_entities = AsyncMock(return_value=None)
    client.search_nodes = AsyncMock(return_value=[])
    return client

@pytest.fixture
def intake_agent(mock_mcp_client):
    """Fixture for an IntakeAssistantAgent instance."""
    return IntakeAssistantAgent(agent_id="test-intake-agent", mcp_client=mock_mcp_client, config={})

@pytest.mark.asyncio
async def test_successful_intake(intake_agent, mock_mcp_client):
    """Test the successful processing of a valid project intake."""
    inputs = {
        'project_name': 'New CRM Integration',
        'description': 'Integrating our new CRM with the sales pipeline.',
        'business_objective': 'Improve customer relationship management efficiency',
        'industry': 'technology',
        'department': 'sales',
        'goals': ['Improve lead tracking', 'Automate sales reports'],
        'success_criteria': ['Increase lead conversion by 15%', 'Reduce manual reporting by 50%'],
        'stakeholders': [
            {'name': 'John Doe', 'role': 'sponsor'},
            {'name': 'Jane Smith', 'role': 'project_manager'}
        ],
        'budget_range': '50k_to_250k',
        'timeline': 'quarterly',
        'urgency': 'medium',
        'expected_participants': 10,
        'geographic_scope': 'national',
        'regulatory_requirements': []
    }
    
    # Mock validate_inputs to always return valid for this test
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.COMPLETED
    assert 'project_data' in result.data
    assert 'recommendations' in result.data
    assert 'analysis_summary' in result.data
    assert result.data['metadata']['mcp_storage_success'] is True

    mock_mcp_client.create_entities.assert_called_once()
    knowledge_entity = mock_mcp_client.create_entities.call_args[0][0][0]
    assert knowledge_entity.title == "Project Intake: New CRM Integration"
    assert knowledge_entity.metadata['project_id'].startswith('proj_')
    assert knowledge_entity.metadata['industry'] == 'technology'

@pytest.mark.asyncio
async def test_input_validation_failure(intake_agent, mock_mcp_client):
    """Test that the agent fails if input validation fails."""
    inputs = {
        'project_name': 'a',
        'description': 'a',
        'goals': []
    } # These inputs will fail validation
    
    # Do not mock validate_inputs here, let the actual validation run

    result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.FAILED
    assert 'Input validation failed' in result.data['error']
    expected_errors = [
        "Field 'project_name' must be at least 3 characters long",
        "Project name must be at least 5 characters long.",
        "Required field 'business_objective' is missing or null",
        "Field 'description' must be at least 20 characters long",
        "Goals cannot be an empty list if provided."
    ]
    assert all(err in result.data['details'] for err in expected_errors)
    mock_mcp_client.create_entities.assert_not_called()

@pytest.mark.asyncio
async def test_mcp_storage_failure(intake_agent, mock_mcp_client, caplog):
    """Test that the agent handles MCP storage failures gracefully."""
    inputs = {
        'project_name': 'Project for MCP Failure',
        'description': 'This project will cause MCP storage to fail.',
        'business_objective': 'Test MCP error handling',
        'industry': 'technology',
        'department': 'it',
        'goals': ['Ensure robustness'],
        'success_criteria': ['No data loss'],
        'stakeholders': [{'name': 'Test User', 'role': 'sponsor'}],
        'budget_range': 'under_50k',
        'timeline': 'quarterly',
        'urgency': 'low',
        'expected_participants': 2,
        'geographic_scope': 'local',
        'regulatory_requirements': []
    }
    
    # Mock validate_inputs to always return valid for this test
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    mock_mcp_client.create_entities.side_effect = Exception("MCP connection error")

    with caplog.at_level(logging.ERROR):
        result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.FAILED
    assert 'Failed to store project data in memory' in result.data['error']
    assert 'MCP connection error' in result.data['details']
    assert 'MCP storage failed' in result.error_details
    assert "AUDIT: Failed to create KnowledgeEntity" in caplog.text
    assert "MCP connection error" in caplog.text

@pytest.mark.asyncio
async def test_check_existing_projects_found(intake_agent, mock_mcp_client):
    """Test _check_existing_projects when similar projects are found."""
    mock_mcp_client.search_nodes.return_value = [
        {'name': 'Existing New CRM Integration Project', 'observations': ['CRM integration for sales']},
        {'name': 'CRM Upgrade Initiative', 'observations': ['Upgrade existing CRM system']}
    ]
    intake_agent.mcp_client = mock_mcp_client
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    inputs = {
        'project_name': 'New CRM Integration',
        'description': 'Integrating our new CRM with the sales pipeline.',
        'business_objective': 'Improve customer relationship management efficiency',
        'industry': 'technology',
        'department': 'sales',
        'goals': ['Improve lead tracking', 'Automate sales reports'],
        'success_criteria': ['Increase lead conversion by 15%', 'Reduce manual reporting by 50%'],
        'stakeholders': [
            {'name': 'John Doe', 'role': 'sponsor'},
            {'name': 'Jane Smith', 'role': 'project_manager'}
        ],
        'budget_range': '50k_to_250k',
        'timeline': 'quarterly',
        'urgency': 'medium',
        'expected_participants': 10,
        'geographic_scope': 'national',
        'regulatory_requirements': []
    }

    result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.FAILED
    assert "Similar project name already exists" in result.data['error']
    mock_mcp_client.search_nodes.assert_called_once_with(query='New CRM Integration')

@pytest.mark.asyncio
async def test_check_existing_projects_not_found(intake_agent, mock_mcp_client):
    """Test _check_existing_projects when no similar projects are found."""
    mock_mcp_client.search_nodes.return_value = [] # No existing projects
    intake_agent.mcp_client = mock_mcp_client
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    inputs = {
        'project_name': 'Truly Unique Project',
        'description': 'A project that has no duplicates.',
        'business_objective': 'Achieve uniqueness and originality in all aspects',
        'industry': 'technology',
        'department': 'it',
        'goals': ['Be original'],
        'success_criteria': ['Pass uniqueness test'],
        'stakeholders': [{'name': 'Solo', 'role': 'sponsor'}],
        'budget_range': 'under_50k',
        'timeline': 'quarterly',
        'urgency': 'low',
        'expected_participants': 1,
        'geographic_scope': 'local',
        'regulatory_requirements': []
    }

    result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.COMPLETED # Should succeed as no duplicates are found
    mock_mcp_client.search_nodes.assert_called_once_with(query='Truly Unique Project')

@pytest.mark.asyncio
async def test_mcp_audit_logging_success(intake_agent, mock_mcp_client, caplog):
    """Test that audit logs are generated for successful MCP write operations."""
    inputs = {
        'project_name': 'Audit Log Test Project',
        'description': 'Testing successful audit logging for MCP.',
        'business_objective': 'Verify logging',
        'industry': 'technology',
        'department': 'it',
        'goals': ['Log everything'],
        'success_criteria': ['Logs are perfect'],
        'stakeholders': [{'name': 'Logger', 'role': 'sponsor'}],
        'budget_range': 'under_50k',
        'timeline': 'quarterly',
        'urgency': 'low',
        'expected_participants': 1,
        'geographic_scope': 'local',
        'regulatory_requirements': []
    }
    
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    with caplog.at_level(logging.INFO):
        result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.COMPLETED
    assert "AUDIT: Attempting to create KnowledgeEntity" in caplog.text
    assert "AUDIT: Successfully created KnowledgeEntity" in caplog.text
    assert f"Successfully stored project intake for {result.data['project_data']['project_id']}" in caplog.text

@pytest.mark.asyncio
async def test_overall_unexpected_error_handling(intake_agent, caplog):
    """Test that the agent handles unexpected errors gracefully at the top level."""
    # Simulate an unexpected error by making a method raise an exception
    intake_agent._classify_project_type = MagicMock(side_effect=Exception("Unexpected classification error"))

    inputs = {
        'project_name': 'Error Test',
        'description': 'This project will trigger an unexpected error.',
        'business_objective': 'Handle errors',
        'industry': 'technology',
        'department': 'it',
        'goals': ['Catch all exceptions'],
        'success_criteria': ['No crashes'],
        'stakeholders': [{'name': 'Error Handler', 'role': 'sponsor'}],
        'budget_range': 'under_50k',
        'timeline': 'quarterly',
        'urgency': 'low',
        'expected_participants': 1,
        'geographic_scope': 'local',
        'regulatory_requirements': []
    }

    # Mock validate_inputs to allow the process to proceed to the error point
    intake_agent.validate_inputs = AsyncMock(return_value=ValidationResult(is_valid=True, errors=[]))

    with caplog.at_level(logging.ERROR):
        result = await intake_agent.execute(inputs)

    assert result.status == AgentStatus.FAILED
    assert "An error occurred during core processing for agent test-intake-agent" in result.data['error']
    assert "Unexpected classification error" in result.data['error']
    assert "An error occurred during core processing for agent test-intake-agent: Unexpected classification error" in caplog.text
    assert "ERROR" in caplog.text
