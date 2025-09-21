import api from "@/lib/api-client.ts";
import { ILoginResponse } from "@/features/auth/types/auth.types.ts";

interface ILdapLogin {
  username: string;
  password: string;
  providerId: string;
  workspaceId: string;
}

export async function ldapLogin(data: ILdapLogin): Promise<ILoginResponse | undefined> {
  const requestData = {
    username: data.username,
    password: data.password,
  };

  try {
    const response = await api.post<ILoginResponse>(
      `/sso/ldap/${data.providerId}/login`,
      requestData
    );

    // The backend returns void for successful login without MFA
    // The interceptor will handle unwrapping the response
    return response.data || undefined;
  } catch (error) {
    throw error;
  }
}
