"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Flame,
  GaugeCircle,
  Layers,
  MessageSquare,
  Users,
  Wrench,
} from "lucide-react";

import { useUserAnalytics } from "@/hooks/queries/use-user-analytics";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Skeleton } from "ui/skeleton";

function formatDateFromIso(input: string | null): Date | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const PAGE_CONTAINER_CLASS =
  "mx-auto w-full max-w-6xl px-2 pb-12 pt-8";

type MetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  helper?: string;
};

function MetricCard({ label, value, icon: Icon, helper }: MetricCardProps) {
  return (
    <Card className="border-border/60 dark:border-white/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {helper ? (
          <p className="mt-1 text-xs text-muted-foreground/80">{helper}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type AnalyticsListItem = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

type AnalyticsListProps = {
  title: string;
  items: AnalyticsListItem[];
  emptyLabel: string;
};

function AnalyticsList({ title, items, emptyLabel }: AnalyticsListProps) {
  return (
    <Card className="h-full border-border/60 dark:border-white/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-3 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-medium leading-none">{item.label}</p>
                  {item.helper ? (
                    <p className="text-xs text-muted-foreground">{item.helper}</p>
                  ) : null}
                </div>
                <span className="whitespace-nowrap text-sm font-semibold">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

type TokenStatProps = {
  label: string;
  value: string;
  helper?: string;
};

function TokenStat({ label, value, helper }: TokenStatProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between">
        <span className="text-lg font-semibold">{value}</span>
        {helper ? (
          <span className="text-[11px] text-muted-foreground/80">{helper}</span>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={`${PAGE_CONTAINER_CLASS} flex flex-col gap-6`}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <Card className="border-border/60 dark:border-white/20">
        <CardContent className="py-16 text-center">
          <p className="text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ label }: { label: string }) {
  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <Card className="border-destructive/40 bg-destructive/5 dark:border-white/20">
        <CardContent className="py-6 text-center">
          <p className="text-sm font-medium text-destructive">{label}</p>
        </CardContent>
      </Card>
    </div>
  );
}

type WeeklyChartData = {
  date: string;
  label: string;
  fullLabel: string;
  queries: number;
};

export default function UserAnalyticsDashboard() {
  const t = useTranslations("UserAnalytics");

  const { data, error, isLoading } = useUserAnalytics({
    refreshInterval: 1000 * 60 * 5,
  });

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const decimalFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
      }),
    [],
  );
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "short" }),
    [],
  );
  const fullDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }),
    [],
  );

  const chartConfig = useMemo(
    () => ({
      queries: {
        label: t("weeklyChartSeriesLabel"),
        color: "#2753e6",
      },
    }),
    [t],
  );

  const weeklyChartData: WeeklyChartData[] = useMemo(() => {
    if (!data) return [];
    return data.activity.weekly.map((day) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      return {
        date: day.date,
        label: weekdayFormatter.format(date),
        fullLabel: fullDateFormatter.format(date),
        queries: day.count,
      } satisfies WeeklyChartData;
    });
  }, [data, weekdayFormatter, fullDateFormatter]);

  const accountCreatedAt = formatDateFromIso(data?.account.createdAt ?? null);
  const firstActivityAt = formatDateFromIso(data?.activity.firstActivityAt ?? null);
  const lastActivityAt = formatDateFromIso(data?.activity.lastActivityAt ?? null);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState label={t("errorState")} />;
  }

  if (!data) {
    return <EmptyState label={t("emptyState")} />;
  }

  const formatTokens = (value?: number) => numberFormatter.format(value ?? 0);

  const favoriteTools: AnalyticsListItem[] = data.favoriteTools.map((tool) => {
    const label =
      tool.toolSource === "mcp" && tool.mcpServerName
        ? `${tool.mcpServerName} • ${tool.toolName}`
        : tool.toolName;
    return {
      id: `${tool.toolSource}-${tool.toolName}-${tool.mcpServerId ?? ""}`,
      label,
      value: t("runsCount", { count: tool.invocations }),
      helper: t(`toolSource.${tool.toolSource}` as const),
    };
  });

  const topAgents: AnalyticsListItem[] = data.topAgents.map((agent) => ({
    id: agent.agentId,
    label: agent.agentName ?? agent.agentId,
    value: t("runsCount", { count: agent.usageCount }),
    helper: agent.ownerName
      ? t("agentOwner", { name: agent.ownerName })
      : undefined,
  }));

  const popularModels: AnalyticsListItem[] = data.popularModels.map((model) => ({
    id: `${model.provider ?? "unknown"}-${model.model ?? "unknown"}`,
    label: `${model.provider ?? t("unknownProvider")} / ${model.model ?? t("unknownModel")}`,
    value: formatTokens(model.totalTokens),
    helper: t("runsCount", { count: model.invocations }),
  }));

  const accountInsights = [
    {
      id: "account-created",
      label: t("accountCreated"),
      value: accountCreatedAt ? fullDateFormatter.format(accountCreatedAt) : t("noData"),
    },
    {
      id: "account-age",
      label: t("accountAge"),
      value:
        data.account.ageDays != null
          ? t("daysCount", { count: data.account.ageDays })
          : t("noData"),
    },
    {
      id: "organizations",
      label: t("organizationsJoined"),
      value: numberFormatter.format(data.organizationsJoined),
    },
    {
      id: "total-chats",
      label: t("totalChats"),
      value: numberFormatter.format(data.totalChats),
    },
    {
      id: "first-activity",
      label: t("firstActivity"),
      value: firstActivityAt ? fullDateFormatter.format(firstActivityAt) : t("noActivityYet"),
    },
    {
      id: "last-activity",
      label: t("lastActive"),
      value: lastActivityAt ? fullDateFormatter.format(lastActivityAt) : t("noActivityYet"),
    },
    {
      id: "tool-actions",
      label: t("toolInvocations"),
      value: numberFormatter.format(data.toolInvocations),
    },
    {
      id: "model-diversity",
      label: t("modelDiversity"),
      value: numberFormatter.format(data.modelDiversity),
    },
  ];

  return (
    <div className={`${PAGE_CONTAINER_CLASS} flex flex-col gap-6`}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("summaryQueriesThisWeek")}
          value={numberFormatter.format(data.totals.queriesThisWeek)}
          icon={BarChart3}
        />
        <MetricCard
          label={t("summaryTotalTokens")}
          value={formatTokens(data.totals.totalTokens)}
          helper={t("summaryTotalTokensHelper")}
          icon={Activity}
        />
        <MetricCard
          label={t("summaryAverageTokens")}
          value={decimalFormatter.format(data.totals.averageTokensPerQuery ?? 0)}
          helper={t("summaryAverageTokensHelper")}
          icon={GaugeCircle}
        />
        <MetricCard
          label={t("summaryCurrentStreak")}
          value={numberFormatter.format(data.activity.currentStreak)}
          helper={t("daysCount", { count: data.activity.currentStreak })}
          icon={Flame}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border/60 dark:border-white/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>{t("weeklyChartTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("weeklyChartDescription")}
              </p>
            </div>
            <Badge variant="outline">{t("lastDays", { count: weeklyChartData.length })}</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            {weeklyChartData.length ? (
              <ChartContainer className="min-h-[260px]" config={chartConfig}>
                <BarChart data={weeklyChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [
                          numberFormatter.format(value as number),
                          t("weeklyChartSeriesLabel"),
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullLabel ?? ""
                        }
                      />
                    }
                  />
                  <Bar dataKey="queries" fill="var(--color-queries)" radius={8} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-56 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("emptyState")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 dark:border-white/20">
          <CardHeader>
            <CardTitle>{t("tokenBreakdownTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TokenStat
              label={t("tokenBreakdownTotal")}
              value={formatTokens(data.totals.totalTokens)}
            />
            <TokenStat
              label={t("tokenBreakdownInput")}
              value={formatTokens(data.totals.inputTokens)}
            />
            <TokenStat
              label={t("tokenBreakdownOutput")}
              value={formatTokens(data.totals.outputTokens)}
            />
            <TokenStat
              label={t("tokenBreakdownQueries")}
              value={numberFormatter.format(data.totals.totalQueries)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("summaryTotalChats")}
          value={numberFormatter.format(data.totalChats)}
          icon={MessageSquare}
        />
        <MetricCard
          label={t("summaryOrganizations")}
          value={numberFormatter.format(data.organizationsJoined)}
          icon={Users}
        />
        <MetricCard
          label={t("summaryToolUsage")}
          value={numberFormatter.format(data.toolInvocations)}
          icon={Wrench}
          helper={t("summaryToolUsageHelper")}
        />
        <MetricCard
          label={t("summaryModelDiversity")}
          value={numberFormatter.format(data.modelDiversity)}
          icon={Layers}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <AnalyticsList
          title={t("favoriteToolsTitle")}
          items={favoriteTools}
          emptyLabel={t("favoriteToolsEmpty")}
        />
        <AnalyticsList
          title={t("topAgentsTitle")}
          items={topAgents}
          emptyLabel={t("topAgentsEmpty")}
        />
        <AnalyticsList
          title={t("popularModelsTitle")}
          items={popularModels}
          emptyLabel={t("popularModelsEmpty")}
        />
      </div>

      <Card className="border-border/60 dark:border-white/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span>{t("accountInsightsTitle")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {accountInsights.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/40 bg-muted/10 px-3 py-3"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
