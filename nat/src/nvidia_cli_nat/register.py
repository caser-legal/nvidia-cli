"""
NVIDIA CLI - NeMo Agent Toolkit Integration
Registers custom tools and workflows for the dory agent
"""

from nat.builder import Builder
from nat.builder.function_base import FunctionBaseConfig
from nat.builder.function_info import FunctionInfo
from nat.registry import register_function
from nat.builder.framework_enum import LLMFrameworkEnum
import subprocess
import os
import json
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# BASH TOOL - Execute shell commands
# =============================================================================
class BashToolConfig(FunctionBaseConfig, name="dory_bash"):
    """Execute bash commands with safety checks"""
    description: str = "Execute bash commands on the local system"
    allowed_commands: list[str] = []  # Empty = all allowed (use with caution)
    timeout: int = 30


@register_function(config_type=BashToolConfig)
async def bash_tool(config: BashToolConfig, builder: Builder):
    async def _execute(command: str) -> str:
        """Execute a bash command and return output"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=config.timeout,
                cwd=os.getcwd()
            )
            output = result.stdout
            if result.stderr:
                output += f"\nSTDERR: {result.stderr}"
            if result.returncode != 0:
                output += f"\nExit code: {result.returncode}"
            return output or "Command completed with no output"
        except subprocess.TimeoutExpired:
            return f"Command timed out after {config.timeout} seconds"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    yield FunctionInfo.from_fn(_execute, description=config.description)


# =============================================================================
# FILE READ TOOL
# =============================================================================
class FileReadToolConfig(FunctionBaseConfig, name="dory_file_read"):
    """Read files from the filesystem"""
    description: str = "Read contents of a file"
    max_size_kb: int = 500


@register_function(config_type=FileReadToolConfig)
async def file_read_tool(config: FileReadToolConfig, builder: Builder):
    async def _read(path: str, start_line: int = 1, end_line: int = -1) -> str:
        """Read a file, optionally specifying line range"""
        try:
            path = os.path.expanduser(path)
            if not os.path.exists(path):
                return f"Error: File not found: {path}"
            
            size_kb = os.path.getsize(path) / 1024
            if size_kb > config.max_size_kb:
                return f"Error: File too large ({size_kb:.1f}KB > {config.max_size_kb}KB limit)"
            
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            
            if end_line == -1:
                end_line = len(lines)
            
            selected = lines[start_line-1:end_line]
            return ''.join(selected)
        except Exception as e:
            return f"Error reading file: {str(e)}"

    yield FunctionInfo.from_fn(_read, description=config.description)


# =============================================================================
# FILE WRITE TOOL
# =============================================================================
class FileWriteToolConfig(FunctionBaseConfig, name="dory_file_write"):
    """Write files to the filesystem"""
    description: str = "Write or modify files"


@register_function(config_type=FileWriteToolConfig)
async def file_write_tool(config: FileWriteToolConfig, builder: Builder):
    async def _write(path: str, content: str, mode: str = "create") -> str:
        """
        Write to a file.
        mode: 'create' (overwrite), 'append', or 'insert'
        """
        try:
            path = os.path.expanduser(path)
            os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
            
            if mode == "append":
                with open(path, 'a', encoding='utf-8') as f:
                    f.write(content)
            else:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
            
            return f"Successfully wrote to {path}"
        except Exception as e:
            return f"Error writing file: {str(e)}"

    yield FunctionInfo.from_fn(_write, description=config.description)


# =============================================================================
# MEMORY TOOL - Persistent memory across sessions
# =============================================================================
class MemoryToolConfig(FunctionBaseConfig, name="dory_memory"):
    """Long-term memory storage"""
    description: str = "Store and retrieve information from long-term memory"
    memory_path: str = "~/.nvidia-cli/memory.json"


@register_function(config_type=MemoryToolConfig)
async def memory_tool(config: MemoryToolConfig, builder: Builder):
    memory_file = os.path.expanduser(config.memory_path)
    
    def _load_memory() -> dict:
        if os.path.exists(memory_file):
            with open(memory_file, 'r') as f:
                return json.load(f)
        return {"entries": [], "entities": {}}
    
    def _save_memory(data: dict):
        os.makedirs(os.path.dirname(memory_file), exist_ok=True)
        with open(memory_file, 'w') as f:
            json.dump(data, f, indent=2)

    async def _memory(operation: str, key: str = "", value: str = "") -> str:
        """
        Memory operations: 'store', 'retrieve', 'search', 'list'
        """
        memory = _load_memory()
        
        if operation == "store":
            memory["entries"].append({"key": key, "value": value})
            _save_memory(memory)
            return f"Stored: {key}"
        
        elif operation == "retrieve":
            for entry in reversed(memory["entries"]):
                if key.lower() in entry["key"].lower():
                    return entry["value"]
            return f"No memory found for: {key}"
        
        elif operation == "search":
            matches = [e for e in memory["entries"] if key.lower() in e["key"].lower() or key.lower() in e["value"].lower()]
            if matches:
                return json.dumps(matches[-5:], indent=2)
            return "No matches found"
        
        elif operation == "list":
            return json.dumps([e["key"] for e in memory["entries"][-20:]], indent=2)
        
        return f"Unknown operation: {operation}"

    yield FunctionInfo.from_fn(_memory, description=config.description)


# =============================================================================
# THINK TOOL - Extended reasoning
# =============================================================================
class ThinkToolConfig(FunctionBaseConfig, name="dory_think"):
    """Extended thinking/reasoning tool"""
    description: str = "Use this tool to think through complex problems step by step"


@register_function(config_type=ThinkToolConfig)
async def think_tool(config: ThinkToolConfig, builder: Builder):
    async def _think(thought: str) -> str:
        """Record a thought or reasoning step. Returns the thought for reference."""
        return f"Thought recorded: {thought}"

    yield FunctionInfo.from_fn(_think, description=config.description)
