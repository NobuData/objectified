# General Instructions

- GitHub Tickets are the source of truth for all work to be done from the NobuData/objectified repository.
- Code in objectified-commercial IS ONLY USED FOR REFERENCE AND SHOULD NOT BE CHANGED IN ANY WAY
- Use context7 MCP where possible for documentation and code generation
- Python code generation should strictly follow PEP8 guidelines
- Keep the chatting down to a minimum, only ask questions if you need more information
- Unit tests must be updated and created as necessary, all tests run using yarn test
- Fix any regressions found during testing
- Use logging where appropriate
- When using `git` commands, always use `--no-pager` to prevent output from being paginated

# REST Instructions

- Rest services should be separated by domain and tags should be used to group related endpoints together based on schema
- Use OpenAPI specifications for all REST endpoints, and ensure they are well-documented with clear descriptions and examples
- Ensure that all REST endpoints have appropriate error handling and return meaningful error messages to the client
- Use appropriate HTTP status codes for all REST responses, and ensure that they are consistent across the application
- Implement authentication and authorization for all REST endpoints, and ensure that sensitive data is protected
- Use pagination for endpoints that return large datasets, and ensure that the pagination parameters are well-documented and easy to use
- Ensure that all REST endpoints are tested thoroughly, including edge cases and error scenarios, and that the tests are run as part of the test suite

# SQL Instructions

- Any new scripts created in objectified-schema/scripts need to pull accurate local time and date for the filename
- Create SQL tests where appropriate in the tests directory of objectified-schema, and ensure they are run as part of the test suite
- Tests should be done against the "objectified_test" database when writing any tests for this project
- SELECT statements must be done using case-insensitive comparisons where appropriate and should use LOWER() = LOWER() where possible to ensure case-insensitivity
- Avoid using LIKE and ILIKE in statements as they can lead to misuse due to wildcard characters
- Only use LIKE and ILIKE in name and description lookups, and ensure that the input is sanitized to prevent SQL injection attacks

# UI Instructions

- Use theme-based light/dark support
- Use lucide-react, NextJS, Radix UI, Tailwind CSS, monaco-editor, and any other relevant libraries as necessary
- Use Radix UI for all application components and design
- Use custom alerts and confirm dialogs when needed, do not use browser built-ins
- Favor using class definitions by name instead of setting them inline in the application: this way the themes can be applied across the board instead if hard-coded

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
