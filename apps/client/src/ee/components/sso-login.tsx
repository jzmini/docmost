import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { Button, Stack } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { buildSsoLoginUrl } from "@/ee/security/sso.utils.ts";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { GoogleIcon } from "@/components/icons/google-icon.tsx";

export default function SsoLogin() {
  console.log('SsoLogin component rendering');
  const { data, isLoading } = useWorkspacePublicDataQuery();

  console.log('SsoLogin - data:', data);
  console.log('SsoLogin - isLoading:', isLoading);
  console.log('SsoLogin - authProviders:', data?.authProviders);

  // Filter out LDAP providers as they're handled in the main login form
  const nonLdapProviders = data?.authProviders?.filter(
    provider => provider.type !== SSO_PROVIDER.LDAP
  ) || [];

  if (!nonLdapProviders || nonLdapProviders.length === 0) {
    console.log('SsoLogin - returning null, no non-LDAP auth providers');
    return null;
  }

  const handleSsoLogin = (provider: IAuthProvider) => {
    // Redirect for SSO providers (LDAP is now handled in main login form)
    window.location.href = buildSsoLoginUrl({
      providerId: provider.id,
      type: provider.type,
      workspaceId: data.id,
    });
  };

  const getProviderIcon = (provider: IAuthProvider) => {
    if (provider.type === SSO_PROVIDER.GOOGLE) {
      return <GoogleIcon size={16} />;
    } else {
      return <IconLock size={16} />;
    }
  };

  return (
    <>
      <Stack align="stretch" justify="center" gap="sm">
        {nonLdapProviders.map((provider) => {
          return (
            <div key={provider.id}>
              <Button
                onClick={() => handleSsoLogin(provider)}
                leftSection={getProviderIcon(provider)}
                variant="default"
                fullWidth
              >
                {provider.name}
              </Button>
            </div>
          );
        })}
      </Stack>
    </>
  );
}
