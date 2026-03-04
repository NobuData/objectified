# General Instructions

- Code in objectified-commercial is used only for reference; new code should not be part of that repository
- Use context7 MCP where possible for documentation and code generation
- Keep the chatting down to a minimum, only ask questions if you need more information
- Unit tests must be updated and created as necessary, all tests run using yarn test
- Fix any regressions found during testing

# SQL Instructions

- Any new scripts created in objectified-schema/scripts needs to pull accurate local time and date for the filename
- Create SQL tests where appropriate

# UI Instructions

- Use theme-based light/dark support
- Use lucide-react, NextJS, Radix UI, Tailwind CSS, monaco-editor, and any other relevant libraries as necessary
- Use Radix UI for components
- Use custom alerts and confirm dialogs when needed, do not use browser built-ins

# NextJS Application Instructions

- Use yarn as the package manager
- Write code to make use of light and dark modes
- Dark mode must be visible automatically based on system preferences
- Use TypeScript for all code

# When creating files

- Use IDE functionality or IDE MCP functions to create files - do not use any other method
- Create files one at a time, do not create multiple files in a single response
- Ensure each file is complete and correct before moving to the next file
- If functionality is being moved from one section to another, maintain the behavior exactly as it was before

# Summarization tasks

- When writing summarizations, DO NOT INVENT TICKETS OR ISSUES. ONLY SUMMARIZE BASED ON THE PROVIDED INFORMATION.
- Do not create documents to summarize information, instead write the summary directly in the response.
