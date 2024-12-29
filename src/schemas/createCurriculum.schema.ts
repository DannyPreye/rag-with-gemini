import z from "zod";

const UnitSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    learningObjectives: z.array(z.string()),
    estimatedDuration: z.string(), // e.g., "2 hours"
    order: z.number(),
});


const ModuleSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prerequisites: z.array(z.string()).optional(),
    units: z.array(UnitSchema),
    order: z.number(),
});

// Define the schema for the complete curriculum
export const CurriculumSchema = z.object({
    modules: z.array(ModuleSchema),
    totalModules: z.number(),
    totalUnits: z.number(),
});
