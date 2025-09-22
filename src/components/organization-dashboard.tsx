"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  OrganizationRole,
  OrganizationMemberWithUser,
} from "app-types/organization";
import { useOrganizations } from "@/hooks/queries/use-organizations";
import { useOrganizationDetail } from "@/hooks/queries/use-organization-detail";
import { useOrganizationAnalytics } from "@/hooks/queries/use-organization-analytics";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { ScrollArea } from "ui/scroll-area";
import { Badge } from "ui/badge";
import { Separator } from "ui/separator";
import { Skeleton } from "ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Checkbox } from "ui/checkbox";
import { cn } from "lib/utils";
import { Trash2, XIcon } from "lucide-react";
import { deleteOrganizationAction } from "@/app/api/organization/[organizationId]/actions";
import { notify } from "lib/notify";

const ROLE_OPTIONS: OrganizationRole[] = ["member", "admin"];

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

function formatTokens(formatter: Intl.NumberFormat, value?: number) {
  return formatter.format(value ?? 0);
}

export default function OrganizationDashboard() {
  const t = useTranslations("Organization");
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const newOrganizationDescription = useMemo(() => {
    // Gracefully handle locales that may not yet include this copy
    if (
      typeof (t as any)?.has === "function" &&
      (t as any).has("newOrganizationDescription")
    ) {
      return t("newOrganizationDescription");
    }
    return "Invite teammates to collaborate with shared tools and analytics.";
  }, [t]);

  const {
    data: organizations,
    isLoading: isOrganizationsLoading,
    mutate: mutateOrganizations,
  } = useOrganizations();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (organizations && organizations.length > 0) {
      setSelectedOrganizationId((current) => current ?? organizations[0].id);
    } else {
      setSelectedOrganizationId(null);
    }
  }, [organizations]);

  const {
    data: organizationDetail,
    isLoading: isDetailLoading,
    mutate: mutateOrganizationDetail,
  } = useOrganizationDetail(selectedOrganizationId ?? undefined);

  const { data: analytics, isLoading: isAnalyticsLoading } =
    useOrganizationAnalytics(selectedOrganizationId ?? undefined, {
      refreshInterval: 1000 * 60 * 5,
    });

  const { data: mcpServers } = useMcpList({ revalidateOnFocus: false });

  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [isInviting, setIsInviting] = useState(false);

  const [sharedServerIds, setSharedServerIds] = useState<string[]>([]);
  const [isUpdatingShares, setIsUpdatingShares] = useState(false);

  useEffect(() => {
    if (organizationDetail?.sharedMcpServerIds) {
      setSharedServerIds(organizationDetail.sharedMcpServerIds);
    } else {
      setSharedServerIds([]);
    }
  }, [organizationDetail?.sharedMcpServerIds]);

  const canManageMembers = useMemo(() => {
    const role = organizationDetail?.membership.role;
    return role === "owner" || role === "admin";
  }, [organizationDetail?.membership.role]);

  const personalMcpServers = useMemo(() => {
    if (!mcpServers) return [];
    return mcpServers.filter((server) => server.scope === "personal");
  }, [mcpServers]);

  const handleCreateOrganization = async () => {
    if (!newOrganizationName.trim()) {
      return;
    }
    setIsCreatingOrganization(true);
    try {
      const created = await fetcher("/api/organization", {
        method: "POST",
        body: JSON.stringify({ name: newOrganizationName.trim() }),
      });
      await mutateOrganizations();
      setSelectedOrganizationId(created.id);
      setNewOrganizationName("");
      toast.success(t("organizationCreated"));
    } catch (error) {
      handleErrorWithToast(toError(error));
    } finally {
      setIsCreatingOrganization(false);
    }
  };

  const handleInviteMember = async () => {
    if (!selectedOrganizationId) return;
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      await fetcher(`/api/organization/${selectedOrganizationId}/members`, {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      await mutateOrganizationDetail();
      setInviteEmail("");
      setInviteRole("member");
      toast.success(t("memberAdded"));
    } catch (error) {
      handleErrorWithToast(toError(error));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (member: OrganizationMemberWithUser) => {
    if (!selectedOrganizationId) return;
    try {
      await fetcher(
        `/api/organization/${selectedOrganizationId}/members/${member.userId}`,
        {
          method: "DELETE",
        },
      );
      await mutateOrganizationDetail();
      toast.success(t("memberRemoved"));
    } catch (error) {
      handleErrorWithToast(toError(error));
    }
  };

  const handleToggleShare = async (serverId: string, checked: boolean) => {
    if (!selectedOrganizationId) return;
    const previous = sharedServerIds;
    const next = checked
      ? Array.from(new Set([...sharedServerIds, serverId]))
      : sharedServerIds.filter((id) => id !== serverId);

    setSharedServerIds(next);
    setIsUpdatingShares(true);
    try {
      await fetcher(`/api/organization/${selectedOrganizationId}/mcp`, {
        method: "PUT",
        body: JSON.stringify({ serverIds: next }),
      });
      await mutateOrganizationDetail();
      toast.success(t("mcpSharesUpdated"));
    } catch (error) {
      handleErrorWithToast(toError(error));
      setSharedServerIds(previous);
    } finally {
      setIsUpdatingShares(false);
    }
  };

  const handleDeleteOrganization = async (organizationId?: string) => {
    if (!organizationId) return;
    const organization = organizations?.find(
      (org) => org.id === organizationId,
    );
    if (!organization) return;

    const confirmed = await notify.confirm({
      title: t("confirmDeleteTitle", { name: organization.name }),
      description: t("confirmDeleteDescription"),
      okText: t("confirmDeleteConfirm"),
    });

    if (!confirmed) return;

    try {
      setIsDeletingOrganization(true);
      await deleteOrganizationAction(organizationId);
      await mutateOrganizations();
      if (selectedOrganizationId === organizationId) {
        setSelectedOrganizationId(null);
        mutateOrganizationDetail(undefined, false);
      }
      toast.success(t("organizationDeleted"));
    } catch (error) {
      handleErrorWithToast(toError(error));
    } finally {
      setIsDeletingOrganization(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 md:flex-row pl-4">
      <Card className="md:w-80 border-border/60 bg-card/90">
        <CardHeader>
          <CardTitle>{t("organizations")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            {isOrganizationsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : organizations && organizations.length > 0 ? (
              <ScrollArea className="max-h-60 pr-2">
                <div className="flex flex-col gap-2">
                  {organizations.map((org) => (
                    <Button
                      key={org.id}
                      variant={
                        selectedOrganizationId === org.id
                          ? "default"
                          : "outline"
                      }
                      className="w-full justify-start rounded-lg border-border/80"
                      onClick={() => setSelectedOrganizationId(org.id)}
                    >
                      <span className="truncate">{org.name}</span>
                      <Badge
                        variant={
                          selectedOrganizationId === org.id
                            ? "secondary"
                            : "outline"
                        }
                        className="ml-auto capitalize"
                      >
                        {t(`role.${org.membershipRole}`)}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noOrganizations")}
              </p>
            )}
          </div>

          <Separator className="opacity-60" />

          <div className="space-y-3 rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="space-y-1">
              <Label
                htmlFor="create-org-name"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t("newOrganization")}
              </Label>
              <p className="text-xs text-muted-foreground/80">
                {newOrganizationDescription}
              </p>
            </div>
            <Input
              id="create-org-name"
              value={newOrganizationName}
              onChange={(event) => setNewOrganizationName(event.target.value)}
              placeholder={t("newOrganizationPlaceholder")}
              disabled={isCreatingOrganization}
            />
            <Button
              onClick={handleCreateOrganization}
              disabled={isCreatingOrganization || !newOrganizationName.trim()}
              className="w-full"
            >
              {isCreatingOrganization ? t("creating") : t("create")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden">
        {!selectedOrganizationId ? (
          <Card className="h-full">
            <CardContent className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">
                {t("selectOrganizationPrompt")}
              </p>
            </CardContent>
          </Card>
        ) : isDetailLoading ? (
          <Card className="h-full">
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : organizationDetail ? (
          <ScrollArea className="h-full pr-4">
            <div className="flex flex-col gap-6 pb-6">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-semibold">
                      {organizationDetail.organization.name}
                    </CardTitle>
                    <p className="text-muted-foreground text-sm">
                      {t("membershipRole", {
                        role: t(
                          `role.${organizationDetail.membership.role}` as const,
                        ),
                      })}
                    </p>
                  </div>
                  {organizationDetail.membership.role === "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-1"
                      disabled={isDeletingOrganization}
                      onClick={() =>
                        handleDeleteOrganization(
                          organizationDetail.organization.id,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">{t("deleteOrganization")}</span>
                    </Button>
                  )}
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t("members")}</CardTitle>
                  <Badge variant="secondary">
                    {organizationDetail.members.length} {t("membersCount")}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("memberName")}</TableHead>
                        <TableHead>{t("memberEmail")}</TableHead>
                        <TableHead>{t("memberRole")}</TableHead>
                        <TableHead className="text-right">
                          {t("memberActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {organizationDetail.members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            {member.user.name ?? t("unknownUser")}
                          </TableCell>
                          <TableCell>{member.user.email}</TableCell>
                          <TableCell className="capitalize">
                            {t(`role.${member.role}` as const)}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageMembers && member.role !== "owner" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveMember(member)}
                              >
                                <XIcon className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {canManageMembers ? (
                    <div className="grid gap-3 rounded-md border p-4">
                      <h3 className="font-medium text-sm">
                        {t("inviteMember")}
                      </h3>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-1">
                          <Label htmlFor="invite-email">
                            {t("memberEmail")}
                          </Label>
                          <Input
                            id="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(event) =>
                              setInviteEmail(event.target.value)
                            }
                            placeholder="name@example.com"
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="invite-role">{t("memberRole")}</Label>
                          <Select
                            value={inviteRole}
                            onValueChange={(value: OrganizationRole) =>
                              setInviteRole(value)
                            }
                          >
                            <SelectTrigger id="invite-role">
                              <SelectValue placeholder={t("memberRole")} />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((role) => (
                                <SelectItem
                                  key={role}
                                  value={role}
                                  className="capitalize"
                                >
                                  {t(`role.${role}` as const)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        onClick={handleInviteMember}
                        disabled={isInviting || !inviteEmail.trim()}
                      >
                        {isInviting ? t("inviting") : t("invite")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("sharedMcpServers")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {personalMcpServers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noPersonalMcpServers")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {personalMcpServers.map((server) => {
                        const checked = sharedServerIds.includes(server.id);
                        return (
                          <div
                            key={server.id}
                            className={cn(
                              "flex items-start gap-3 rounded-md border p-3",
                              checked && "border-primary/60 bg-primary/5",
                            )}
                          >
                            <Checkbox
                              id={`mcp-${server.id}`}
                              checked={checked}
                              disabled={isUpdatingShares}
                              onCheckedChange={(value) =>
                                handleToggleShare(server.id, value === true)
                              }
                            />
                            <div className="space-y-1">
                              <Label
                                htmlFor={`mcp-${server.id}`}
                                className="cursor-pointer"
                              >
                                {server.name}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {t("mcpServerSharedDescription")}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("usageAnalytics")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isAnalyticsLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : analytics ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-3">
                        <TokenStat
                          label={t("totalTokens")}
                          value={formatTokens(
                            numberFormatter,
                            analytics.totals.totalTokens,
                          )}
                        />
                        <TokenStat
                          label={t("inputTokens")}
                          value={formatTokens(
                            numberFormatter,
                            analytics.totals.inputTokens,
                          )}
                        />
                        <TokenStat
                          label={t("outputTokens")}
                          value={formatTokens(
                            numberFormatter,
                            analytics.totals.outputTokens,
                          )}
                        />
                      </div>

                      <div className="grid gap-6 md:grid-cols-2">
                        <AnalyticsList
                          title={t("popularModels")}
                          emptyLabel={t("noAnalyticsData")}
                          items={analytics.popularModels.map((model) => ({
                            id: `${model.provider ?? "unknown"}-${model.model ?? "unknown"}`,
                            label: `${model.provider ?? t("unknown")}/${model.model ?? t("unknown")}`,
                            value: formatTokens(
                              numberFormatter,
                              model.totalTokens,
                            ),
                          }))}
                        />
                        <AnalyticsList
                          title={t("favoriteTools")}
                          emptyLabel={t("noAnalyticsData")}
                          items={analytics.favoriteTools.map((tool) => ({
                            id: `${tool.toolSource}-${tool.toolName}-${tool.mcpServerId ?? ""}`,
                            label:
                              tool.toolSource === "mcp" && tool.mcpServerName
                                ? `${tool.mcpServerName} / ${tool.toolName}`
                                : tool.toolName,
                            value: formatTokens(
                              numberFormatter,
                              tool.invocations,
                            ),
                          }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("noAnalyticsData")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        ) : null}
      </div>
    </div>
  );
}

function TokenStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AnalyticsList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: { id: string; label: string; value: string }[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <span className="truncate text-sm font-medium">{item.label}</span>
              <span className="text-sm text-muted-foreground">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
