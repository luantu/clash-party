import BasePage from '@renderer/components/base/base-page'
import TrafficRankings from '@renderer/components/traffic/traffic-rankings'
import TrafficTrendChart from '@renderer/components/traffic/traffic-trend-chart'
import TrafficDetailsTable from '@renderer/components/traffic/traffic-details-table'
import {
  getTrafficData,
  getSubStatsByHost,
  getDevicesByHost,
  getProxyStatsByHost,
  getSourceIPs,
  type AggregatedData,
  type DataUsageType
} from '@renderer/utils/dataUsage'
import { db } from '@renderer/utils/db'
import { Button, Select, SelectItem, Spinner, Tab, Tabs } from '@heroui/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { calcTraffic } from '@renderer/utils/calc'
import { CgTrash } from 'react-icons/cg'

type TimeRange = '1h' | '24h' | '7d' | '30d'

const TIME_RANGES: TimeRange[] = ['1h', '24h', '7d', '30d']

function getTimeRange(range: TimeRange): { start: number; end: number; bucketSizeMs: number } {
  const end = Date.now()
  const ms: Record<TimeRange, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }
  const bucket: Record<TimeRange, number> = {
    '1h': 5 * 60 * 1000,
    '24h': 60 * 60 * 1000,
    '7d': 6 * 60 * 60 * 1000,
    '30d': 24 * 60 * 60 * 1000
  }
  return { start: end - ms[range], end, bucketSizeMs: bucket[range] }
}

const TrafficPage: React.FC = () => {
  const { t } = useTranslation()
  const [activeView, setActiveView] = useState<DataUsageType>('host')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [rankings, setRankings] = useState<AggregatedData[]>([])
  const [trendData, setTrendData] = useState<
    { timestamp: number; upload: number; download: number }[]
  >([])
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [subStats, setSubStats] = useState<AggregatedData[]>([])
  const [proxyStatsMap, setProxyStatsMap] = useState<Record<string, AggregatedData[]>>({})
  const [selectedSubRow, setSelectedSubRow] = useState<string | null>(null)
  const [totalStats, setTotalStats] = useState({ upload: 0, download: 0, total: 0, count: 0 })
  const [bucketSizeMs, setBucketSizeMs] = useState(60 * 60 * 1000)
  const [isLoading, setIsLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandingKey, setExpandingKey] = useState<string | null>(null)
  const [sourceIPFilter, setSourceIPFilter] = useState<string>('')
  const [sourceIPs, setSourceIPs] = useState<string[]>([])
  const loadIdRef = useRef(0)

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current
    setIsLoading(true)

    const { start, end, bucketSizeMs: bms } = getTimeRange(timeRange)
    setBucketSizeMs(bms)
    const filterIP = sourceIPFilter || undefined

    const [data, ips] = await Promise.all([
      getTrafficData(activeView, start, end, bms, filterIP),
      getSourceIPs(start, end)
    ])

    if (loadId !== loadIdRef.current) return

    setRankings(data.rankings)
    setTrendData(data.trend)
    setSourceIPs(ips)
    setTotalStats(
      data.rankings.reduce(
        (acc, r) => ({
          upload: acc.upload + r.upload,
          download: acc.download + r.download,
          total: acc.total + r.total,
          count: acc.count + r.count
        }),
        { upload: 0, download: 0, total: 0, count: 0 }
      )
    )

    setSelectedRow(null)
    setSubStats([])
    setProxyStatsMap({})
    setSelectedSubRow(null)
    setIsLoading(false)
  }, [activeView, timeRange, sourceIPFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (activeView === 'sourceIP') {
      setSourceIPFilter('')
    }
  }, [activeView])

  const handleSelectRow = useCallback(
    async (label: string) => {
      if (selectedRow === label) {
        setSelectedRow(null)
        setSubStats([])
        setProxyStatsMap({})
        setSelectedSubRow(null)
        return
      }
      setSelectedRow(label)
      setSelectedSubRow(null)
      setProxyStatsMap({})
      setDetailLoading(true)

      const { start, end } = getTimeRange(timeRange)
      const filterIP = sourceIPFilter || undefined
      let subs: AggregatedData[]
      if (activeView === 'host') {
        subs = await getDevicesByHost(label, start, end)
      } else {
        subs = await getSubStatsByHost(activeView, label, start, end, filterIP)
      }
      setSubStats(subs)
      setDetailLoading(false)
    },
    [selectedRow, activeView, timeRange, sourceIPFilter]
  )

  const handleSubRowClick = useCallback(
    async (parentLabel: string, subLabel: string) => {
      const compositeKey = `${parentLabel}:${subLabel}`
      if (selectedSubRow === compositeKey) {
        setSelectedSubRow(null)
        return
      }
      setSelectedSubRow(compositeKey)

      if (proxyStatsMap[compositeKey]) return
      setExpandingKey(compositeKey)
      const { start, end } = getTimeRange(timeRange)
      const filterIP = sourceIPFilter || undefined
      const proxies = await getProxyStatsByHost(
        activeView,
        parentLabel,
        subLabel,
        start,
        end,
        filterIP
      )
      setProxyStatsMap((prev) => ({ ...prev, [compositeKey]: proxies }))
      setExpandingKey(null)
    },
    [selectedSubRow, proxyStatsMap, activeView, timeRange, sourceIPFilter]
  )

  const handleClearAll = useCallback(async () => {
    await db.clearAll()
    await load()
  }, [load])

  const timeRangeLabel: Record<TimeRange, string> = {
    '1h': t('traffic.timeRange.1h'),
    '24h': t('traffic.timeRange.24h'),
    '7d': t('traffic.timeRange.7d'),
    '30d': t('traffic.timeRange.30d')
  }

  const viewLabels: Record<DataUsageType, string> = {
    sourceIP: t('traffic.view.sourceIP'),
    host: t('traffic.view.host'),
    outbound: t('traffic.view.outbound'),
    process: t('traffic.view.process')
  }

  return (
    <BasePage
      title={t('sider.cards.traffic')}
      header={
        <div className="app-nodrag flex items-center gap-2">
          <Tabs
            size="sm"
            selectedKey={timeRange}
            onSelectionChange={(k) => setTimeRange(k as TimeRange)}
          >
            {TIME_RANGES.map((r) => (
              <Tab key={r} title={timeRangeLabel[r]} />
            ))}
          </Tabs>
          <Button
            size="sm"
            variant="light"
            color="danger"
            isIconOnly
            title={t('traffic.clearAll')}
            onPress={handleClearAll}
          >
            <CgTrash className="text-[16px]" />
          </Button>
        </div>
      }
    >
      <div className="relative flex flex-col gap-3 p-2">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[2px]">
            <Spinner size="lg" />
          </div>
        )}
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t('traffic.sessions'), value: totalStats.count.toString() },
            { label: t('traffic.upload'), value: calcTraffic(totalStats.upload) },
            { label: t('traffic.download'), value: calcTraffic(totalStats.download) },
            { label: t('traffic.total'), value: calcTraffic(totalStats.total) }
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-xl border border-foreground/10 bg-content1 py-3 shadow-sm"
            >
              <span className="text-[11px] text-foreground/50 uppercase tracking-wide">
                {label}
              </span>
              <span className="mt-0.5 text-sm font-bold text-foreground">{value}</span>
            </div>
          ))}
        </div>

        {/* Source IP filter */}
        {activeView !== 'sourceIP' && (
          <Select
            size="sm"
            className="w-44"
            placeholder={t('traffic.allDevices')}
            selectedKeys={sourceIPFilter ? [sourceIPFilter] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys as Set<string>)[0] || ''
              setSourceIPFilter(selected)
            }}
            items={sourceIPs.map((ip) => ({ key: ip, label: ip }))}
          >
            {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
          </Select>
        )}

        {/* View tabs */}
        <Tabs
          size="sm"
          selectedKey={activeView}
          onSelectionChange={(k) => setActiveView(k as DataUsageType)}
        >
          {(Object.keys(viewLabels) as DataUsageType[]).map((v) => (
            <Tab key={v} title={viewLabels[v]} />
          ))}
        </Tabs>

        {/* Rankings + Chart */}
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 h-52 overflow-hidden rounded-xl border border-foreground/10 bg-content1 p-3 shadow-sm">
            <TrafficRankings
              title={viewLabels[activeView]}
              data={rankings}
              selectedRow={selectedRow}
              onSelect={handleSelectRow}
            />
          </div>
          <div className="col-span-3 h-52 overflow-hidden rounded-xl border border-foreground/10 bg-content1 p-3 shadow-sm">
            <TrafficTrendChart data={trendData} bucketSizeMs={bucketSizeMs} />
          </div>
        </div>

        {/* Detail table */}
        {selectedRow && (
          <TrafficDetailsTable
            selectedRow={selectedRow}
            activeView={activeView}
            subStats={subStats}
            proxyStatsMap={proxyStatsMap}
            selectedSubRow={selectedSubRow}
            onSubRowClick={handleSubRowClick}
            isLoading={detailLoading}
            expandingKey={expandingKey}
          />
        )}
      </div>
    </BasePage>
  )
}

export default TrafficPage
