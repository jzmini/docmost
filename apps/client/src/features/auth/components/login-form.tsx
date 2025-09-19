import * as z from "zod";
import { useForm, zodResolver } from "@mantine/form";
import useAuth from "@/features/auth/hooks/use-auth";
import { ILogin } from "@/features/auth/types/auth.types";
import {
  Container,
  Title,
  TextInput,
  Button,
  PasswordInput,
  Box,
  Anchor,
  Group,
  Select,
  Divider,
  Stack,
} from "@mantine/core";
import classes from "./auth.module.css";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { Link, useNavigate } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useTranslation } from "react-i18next";
import SsoLogin from "@/ee/components/sso-login.tsx";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { Error404 } from "@/components/ui/error-404.tsx";
import React, { useState, useEffect } from "react";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { ldapLogin } from "@/ee/security/services/ldap-auth-service";
import { notifications } from "@mantine/notifications";
import { IconDatabase, IconServer } from "@tabler/icons-react";

const localFormSchema = z.object({
  email: z
    .string()
    .min(1, { message: "email is required" })
    .email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

const ldapFormSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type AuthMethod = 'local' | string; // string for LDAP provider IDs

export function LoginForm() {
  const { t } = useTranslation();
  const { signIn, isLoading: isLocalLoading } = useAuth();
  const navigate = useNavigate();
  useRedirectIfAuthenticated();
  const {
    data,
    isLoading: isDataLoading,
    isError,
    error,
  } = useWorkspacePublicDataQuery();

  // Get LDAP providers
  const ldapProviders = data?.authProviders?.filter(
    (p) => p.type === SSO_PROVIDER.LDAP
  ) || [];
  
  // Get non-LDAP SSO providers
  const otherSsoProviders = data?.authProviders?.filter(
    (p) => p.type !== SSO_PROVIDER.LDAP
  ) || [];

  // Initialize auth method based on available options
  const getDefaultAuthMethod = (): AuthMethod => {
    if (data?.enforceSso && ldapProviders.length > 0) {
      return ldapProviders[0].id;
    } else if (!data?.enforceSso && ldapProviders.length > 0) {
      // Set LDAP as default if configured
      return ldapProviders[0].id;
    }
    return 'local';
  };

  const [authMethod, setAuthMethod] = useState<AuthMethod>(() => getDefaultAuthMethod());
  const [isLdapLoading, setIsLdapLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Only set default auth method once when data is loaded
  useEffect(() => {
    if (data && !hasInitialized) {
      setAuthMethod(getDefaultAuthMethod());
      setHasInitialized(true);
    }
  }, [data, hasInitialized]);

  const localForm = useForm<ILogin>({
    validate: zodResolver(localFormSchema),
    initialValues: {
      email: "",
      password: "",
    },
  });

  const ldapForm = useForm<{ username: string; password: string }>({
    validate: zodResolver(ldapFormSchema),
    initialValues: {
      username: "",
      password: "",
    },
  });

  const isLoading = isLocalLoading || isLdapLoading;
  const selectedLdapProvider = ldapProviders.find(p => p.id === authMethod);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (authMethod === 'local') {
      const validation = localForm.validate();
      if (!validation.hasErrors) {
        await signIn(localForm.values);
      }
    } else if (selectedLdapProvider) {
      const validation = ldapForm.validate();
      if (!validation.hasErrors) {
        setIsLdapLoading(true);
        try {
          const response = await ldapLogin({
            username: ldapForm.values.username,
            password: ldapForm.values.password,
            providerId: selectedLdapProvider.id,
            workspaceId: data!.id,
          });

          if (response?.userHasMfa) {
            navigate(APP_ROUTE.AUTH.MFA_CHALLENGE);
          } else if (response?.requiresMfaSetup) {
            navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED);
          } else {
            navigate(APP_ROUTE.HOME);
          }
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || "Authentication failed";
          notifications.show({
            message: errorMessage,
            color: "red",
          });
        } finally {
          setIsLdapLoading(false);
        }
      }
    }
  }

  // Build auth method options
  const authOptions = [
    ...(!data?.enforceSso ? [{ value: 'local', label: 'Local Database', icon: IconDatabase }] : []),
    ...ldapProviders.map(p => ({
      value: p.id,
      label: p.name,
      icon: IconServer
    }))
  ];

  if (isDataLoading) {
   return null;
  }

  if (isError && error?.["response"]?.status === 404) {
    return <Error404 />;
  }

  return (
    <Container size={420} className={classes.container}>
      <Box p="xl" className={classes.containerBox}>
        <Title order={2} ta="center" fw={500} mb="md">
          {t("Login")}
        </Title>

        {/* Show other SSO providers (Google, etc) if any */}
        {otherSsoProviders.length > 0 && (
          <>
            <SsoLogin />
            {(authOptions.length > 0 || !data?.enforceSso) && (
              <Divider my="xs" label="OR" labelPosition="center" />
            )}
          </>
        )}

        {/* Unified login form */}
        {(authOptions.length > 0 || !data?.enforceSso) && (
          <form onSubmit={handleSubmit}>
            <Stack>
              {/* Auth method selector - only show if multiple options */}
              {authOptions.length > 1 && (
                <Select
                  label={t("Authentication Method")}
                  placeholder="Select authentication method"
                  value={authMethod}
                  onChange={(value) => {
                    if (value) {
                      setAuthMethod(value);
                      // Clear form errors when switching
                      localForm.clearErrors();
                      ldapForm.clearErrors();
                    }
                  }}
                  data={authOptions.map(opt => ({
                    value: opt.value,
                    label: opt.label,
                    // TODO: Add icons when Mantine Select supports it
                  }))}
                  variant="filled"
                />
              )}

              {/* Local auth form */}
              {authMethod === 'local' && (
                <>
                  <TextInput
                    id="email"
                    type="email"
                    label={t("Email")}
                    placeholder="email@example.com"
                    variant="filled"
                    disabled={isLoading}
                    {...localForm.getInputProps("email")}
                  />

                  <PasswordInput
                    label={t("Password")}
                    placeholder={t("Your password")}
                    variant="filled"
                    disabled={isLoading}
                    {...localForm.getInputProps("password")}
                  />

                  <Group justify="flex-end" mt="xs">
                    <Anchor
                      to={APP_ROUTE.AUTH.FORGOT_PASSWORD}
                      component={Link}
                      underline="never"
                      size="sm"
                    >
                      {t("Forgot your password?")}
                    </Anchor>
                  </Group>
                </>
              )}

              {/* LDAP auth form */}
              {selectedLdapProvider && (
                <>
                  <TextInput
                    id="username"
                    type="text"
                    label={t("Username / Email")}
                    placeholder="Enter your username or email"
                    description="Enter the identifier configured for LDAP authentication"
                    variant="filled"
                    disabled={isLoading}
                    data-autofocus
                    {...ldapForm.getInputProps("username")}
                  />

                  <PasswordInput
                    label={t("Password")}
                    placeholder={t("Enter your password")}
                    variant="filled"
                    disabled={isLoading}
                    {...ldapForm.getInputProps("password")}
                  />
                </>
              )}

              <Button type="submit" fullWidth mt="md" loading={isLoading}>
                {t("Sign In")}
              </Button>
            </Stack>
          </form>
        )}
      </Box>
    </Container>
  );
}
