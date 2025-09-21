import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";

export const useLicense = () => {
  return { hasLicenseKey: true };
};

export default useLicense;
