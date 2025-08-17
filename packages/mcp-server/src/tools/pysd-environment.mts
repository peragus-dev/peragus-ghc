import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  pysdEnvironmentSetupTool,
  pysdRunModelTool,
  pysdValidateModelTool,
  handlePysdEnvironmentSetup,
  handlePysdRunModel,
  handlePysdValidateModel
} from "./pysd/pysd-runner.mts";

// Export the tools for registration
export const pysdEnvironmentTools: Tool[] = [
  pysdEnvironmentSetupTool,
  pysdRunModelTool,
  pysdValidateModelTool
];

// Export the handler function
export async function handlePysdEnvironmentTool(
  name: string,
  args: any
) {
  switch (name) {
    case "pysd_environment_setup":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await handlePysdEnvironmentSetup(args), null, 2)
          }
        ]
      };
    
    case "pysd_run_model":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await handlePysdRunModel(args), null, 2)
          }
        ]
      };
    
    case "pysd_validate_model":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await handlePysdValidateModel(args), null, 2)
          }
        ]
      };
    
    default:
      throw new Error(`Unknown PySD environment tool: ${name}`);
  }
}