export const CURRICULUM_PROMPT = `
Given the provided context, generate a structured curriculum with modules and units.
The curriculum should be comprehensive and well-organized, following these guidelines:

1. Each module should:
   - Have a clear, descriptive title
   - Include a concise description of the module's content and goals
   - List any prerequisites if applicable
   - Be numbered in a logical order

2. Each unit within a module should:
   - Have a specific, focused title
   - Include a clear description of the unit's content
   - List 2-4 concrete learning objectives
   - Include an estimated duration
   - Be numbered in a logical sequence within its module

3. The overall curriculum should:
   - Progress from foundational to advanced concepts
   - Maintain logical connections between modules and units
   - Be comprehensive yet concise
   - Include practical and theoretical components


`;
