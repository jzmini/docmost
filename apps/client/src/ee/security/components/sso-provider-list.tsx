import React, { useState, useEffect } from "react";
import {
  useDeleteSsoProviderMutation,
  useGetSsoProviders,
} from "@/ee/security/queries/security-query.ts";
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Menu,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconDots,
  IconLock,
  IconPencil,
  IconRefresh,
  IconServer,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { useTranslation } from "react-i18next";
import SsoProviderModal from "@/ee/security/components/sso-provider-modal.tsx";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { GoogleIcon } from "@/components/icons/google-icon.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import RoleSelectMenu from "@/components/ui/role-select-menu.tsx";
import { getUserRoleLabel } from "@/features/workspace/types/user-role-data.ts";

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'disconnected':
      return 'red';
    case 'invalid_config':
      return 'yellow';
    case 'auth_failed':
      return 'orange';
    case 'timeout':
      return 'red';
    case 'error':
      return 'red';
    case 'checking':
      return 'blue';
    case 'unchecked':
    default:
      return 'gray';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'invalid_config':
      return 'Invalid Config';
    case 'auth_failed':
      return 'Auth Failed';
    case 'timeout':
      return 'Timeout';
    case 'error':
      return 'Error';
    case 'checking':
      return 'Checking...';
    case 'unchecked':
    default:
      return 'Not Checked';
  }
}

export default function SsoProviderList() {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useGetSsoProviders();
  const [opened, { open, close }] = useDisclosure(false);
  const deleteSsoProviderMutation = useDeleteSsoProviderMutation();
  const [editProvider, setEditProvider] = useState<IAuthProvider | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);

  // Auto-refresh after initial load to get updated statuses
  useEffect(() => {
    if (data) {
      console.log('Providers data:', data.map((p: any) => ({
        id: p.id,
        type: p.type,
        connectionStatus: p.connectionStatus,
        lastCheckedAt: p.lastCheckedAt,
        lastError: p.lastError
      })));
      // Give backend time to check connections, then refresh
      const timer = setTimeout(() => {
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data?.length]); // Only on initial load or when providers added/removed

  const checkProviderStatus = async (providerId: string) => {
    setCheckingStatus(providerId);
    try {
      const response = await fetch(`/api/sso/providers/${providerId}/check-connection`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Refresh the provider list to get updated status
        setTimeout(() => refetch(), 500); // Small delay to ensure DB is updated
      }
    } catch (error) {
      console.error('Failed to check provider status:', error);
    } finally {
      setCheckingStatus(null);
    }
  };

  if (isLoading || !data) {
    return null;
  }

  if (data?.length === 0) {
    return <Text c="dimmed">{t("No SSO providers found.")}</Text>;
  }

  const handleEdit = (provider: IAuthProvider) => {
    setEditProvider(provider);
    open();
  };

  const openDeleteModal = (providerId: string) =>
    modals.openConfirmModal({
      title: t("Delete SSO provider"),
      centered: true,
      children: (
        <Text size="sm">
          {t("Are you sure you want to delete this SSO provider?")}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Don't") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteSsoProviderMutation.mutateAsync(providerId),
    });

  return (
    <>
      <Card shadow="sm" radius="sm">
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Name")}</Table.Th>
                <Table.Th>{t("Type")}</Table.Th>
                <Table.Th>{t("Status")}</Table.Th>
                <Table.Th>{t("Allow signup")}</Table.Th>
                <Table.Th>{t("Action")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data
                .sort((a, b) => {
                  const enabledDiff = Number(b.isEnabled) - Number(a.isEnabled);
                  if (enabledDiff !== 0) return enabledDiff;
                  return a.name.localeCompare(b.name);
                })
                .map((provider: IAuthProvider, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {provider.type === SSO_PROVIDER.GOOGLE ? (
                          <GoogleIcon size={16} />
                        ) : provider.type === SSO_PROVIDER.LDAP ? (
                          <IconServer size={16} />
                        ) : (
                          <IconLock size={16} />
                        )}
                        <div>
                          <Text fz="sm" fw={500}>
                            {provider.name}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={"gray"} variant="light" style={{ whiteSpace: "nowrap" }}>
                        {provider.type.toUpperCase()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {provider.type === 'ldap' ? (
                        <Group gap="xs">
                          <Tooltip 
                            label={
                            provider.lastError ? 
                            `Error: ${provider.lastError}` : 
                            provider.lastCheckedAt ? 
                            `Last checked: ${new Date(provider.lastCheckedAt).toLocaleString()}` : 
                            'Never checked'
                            }
                          >
                            <Badge
                              color={getStatusColor(provider.connectionStatus || 'unchecked')}
                              variant="light"
                            >
                              {getStatusLabel(provider.connectionStatus || 'unchecked')}
                            </Badge>
                          </Tooltip>
                          <ActionIcon 
                            size="xs" 
                            variant="subtle"
                            onClick={() => checkProviderStatus(provider.id)}
                            loading={checkingStatus === provider.id}
                            title="Check connection status"
                          >
                            <IconRefresh size={14} />
                          </ActionIcon>
                        </Group>
                      ) : (
                        <Badge
                          color={provider.isEnabled ? "blue" : "gray"}
                          variant="light"
                        >
                          {provider.isEnabled ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {provider.allowSignup ? (
                        <ThemeIcon variant="light" size={24} radius="xl">
                          <IconCheck size={16} />
                        </ThemeIcon>
                      ) : (
                        <ThemeIcon
                          variant="light"
                          color="red"
                          size={24}
                          radius="xl"
                        >
                          <IconX size={16} />
                        </ThemeIcon>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => handleEdit(provider)}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <Menu
                        transitionProps={{ transition: "pop" }}
                        withArrow
                        position="bottom-end"
                        withinPortal
                      >
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            onClick={() => handleEdit(provider)}
                            leftSection={<IconPencil size={16} />}
                          >
                            {t("Edit")}
                          </Menu.Item>
                          <Menu.Item
                            onClick={() => openDeleteModal(provider.id)}
                            leftSection={<IconTrash size={16} />}
                            color="red"
                            disabled={provider.type === SSO_PROVIDER.GOOGLE}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <SsoProviderModal
        opened={opened}
        onClose={close}
        provider={editProvider}
      />
    </>
  );
}
