/**
 * AI 问答适配层 —— OpenAI 兼容协议（POST {baseUrl}/chat/completions）
 *
 * 同一套代码可对接：
 *   · 阿里云百炼 / 通义千问  baseUrl=https://dashscope.aliyuncs.com/compatible-mode/v1  model=qwen-plus
 *   · DeepSeek              baseUrl=https://api.deepseek.com/v1                        model=deepseek-chat
 *   · Kimi / 智谱 / OpenAI / 自建 vLLM、Ollama —— 均按其 OpenAI 兼容端点填写
 *
 * 设计原则：
 *   1. 零新增依赖（Node 18+ 原生 fetch + ReadableStream）
 *   2. 无 Key 时不抛错，由上层降级为本地规章匹配，功能不中断
 *   3. 事实来自检索（regulations / standard_items），模型只负责组织语言并标注条款号
 */

/* ===================== 配置 ===================== */

export function aiConfig() {
  return {
    baseUrl: (process.env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'qwen-plus',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
    maxTokens: Number(process.env.AI_MAX_TOKENS || 700),
    temperature: Number(process.env.AI_TEMPERATURE || 0.2)
  }
}

export function isAiConfigured() {
  return Boolean(aiConfig().apiKey)
}

/** 供前端展示的脱敏状态 */
export function aiStatus() {
  const c = aiConfig()
  return {
    configured: Boolean(c.apiKey),
    model: c.apiKey ? c.model : '',
    provider: c.apiKey ? providerName(c.baseUrl) : '',
    // 只回显 Key 后 4 位，避免泄露
    keyHint: c.apiKey ? `****${c.apiKey.slice(-4)}` : ''
  }
}

function providerName(baseUrl) {
  if (baseUrl.includes('dashscope')) return '阿里云百炼 · 通义千问'
  if (baseUrl.includes('deepseek')) return 'DeepSeek'
  if (baseUrl.includes('moonshot')) return 'Kimi'
  if (baseUrl.includes('bigmodel')) return '智谱 GLM'
  if (baseUrl.includes('openai.com')) return 'OpenAI'
  return '自定义兼容网关'
}

/* ===================== 文本归一化与检索 ===================== */

/** 去空白标点、全角转半角、英文字母小写 */
export function normalize(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .replace(/[？?。，,！!、；;：:"'“”‘’（）()【】\[\]]/g, '')
    .toLowerCase()
}

/**
 * 口语 / 别名 → 规章正式物品名
 * 用于把「吹风筒」「小太阳」「电饭锅」这类叫法归一到条款里的措辞
 */
const ALIASES = {
  电煮锅: ['电热锅', '煮面锅', '小电锅', '多功能锅', '电火锅'],
  电饭煲: ['电饭锅', '饭锅', '电饭褒', '电饭宝'],
  电磁炉: ['电磁灶', '电陶炉'],
  热得快: ['热得块', '电热棒', '加热棒', '速热器'],
  电热水壶: ['烧水壶', '快壶', '水壶', '电水壶'],
  电热毯: ['电褥子', '电热毯子', '暖毯'],
  电暖器: ['取暖器', '小太阳', '暖风机', '电暖气', '油汀', '暖手宝'],
  吹风机: ['吹风筒', '电吹风', '风筒', '吹头发的'],
  加湿器: ['雾化器', '香薰加湿器'],
  风扇: ['电风扇', '小风扇', '台扇'],
  酒精炉: ['酒精灯', '酒精锅'],
  蜡烛: ['香薰蜡烛', '生日蜡烛'],
  打火机: ['打火机气罐', '打火机油', '点烟器', '火机'],
  烧烤用具: ['烧烤架', '烤炉', '炭火炉', '烤肉架'],
  管制刀具: ['弹簧刀', '匕首', '水果刀', '刀'],
  宠物: ['猫', '狗', '仓鼠', '兔子', '龟', '鸟', '仓鼠笼'],
  台灯: ['护眼灯', '书桌灯', '小夜灯'],
  电脑: ['笔记本', '台式机', '电脑主机'],
  插线板: ['排插', '插座', '插排', '接线板'],
  蚊帐: ['蚊香', '驱蚊器']
}

/** 干扰词：含有关键字但语义无关，匹配前先剔除，避免单字误命中 */
const NEGATIVE = [
  '火锅', '锅盖', '锅巴', '锅铲', '刷锅', '背锅', // 含「锅」非电器
  '猫粮', '猫砂', '狗粮', '宠物食品', // 含「猫/狗」非活体
  '申报流程', '怎么申报', '如何申报', // 含「申报」但问的是流程
  '热水袋', '暖宝宝贴' // 化学发热，非电器
]

/**
 * 多候选打分检索（同时检索规章条文与物品分级标准）
 * 解决旧实现「first-match-wins + 单字关键词」导致的漏报与误命中：
 *   · 长词权重高（「电饭煲」> 「锅」）
 *   · 单字命中降权并标记 weak
 *   · 取最高分而非第一个命中
 *   · 术语先经干扰词剔除、别名归一后再比对正文，杜绝"火锅=烹饪电器"
 */
export function retrieve(db, question, topK = 3) {
  // 1) 剔除干扰词，避免「火锅」被「锅」命中
  let q = normalize(question)
  for (const neg of NEGATIVE) q = q.split(normalize(neg)).join('\u0000')
  if (!q) return []

  const regs = db.prepare('SELECT * FROM regulations ORDER BY id').all()
  const stds = db.prepare('SELECT * FROM standard_items ORDER BY id').all()
  const hits = []

  /* --- 规章条文 --- */
  for (const r of regs) {
    const keys = String(r.keywords || '').split(',').map((k) => k.trim()).filter(Boolean)
    const body = normalize(`${r.content}${r.title}`)
    let best = null

    for (const k of keys) {
      const nk = normalize(k)
      if (!nk || !q.includes(nk)) continue
      const score = nk.length ** 2 * (nk.length === 1 ? 0.15 : 1) // 词长平方加权，单字降权
      if (!best || score > best.score) best = { score, keyword: k, weak: nk.length === 1 }
    }

    // 别名归一：问题里的口语词，若本身或其正式名出现在本条正文/关键词中，即视为命中
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      const terms = [canonical, ...aliases]
      const asked = terms.find((t) => q.includes(normalize(t)))
      if (!asked) continue
      const related =
        keys.some((k) => normalize(k).includes(normalize(canonical)) || normalize(canonical).includes(normalize(k))) ||
        terms.some((t) => body.includes(normalize(t)))
      if (!related) continue
      const score = normalize(asked).length ** 2 * 1.2
      if (!best || score > best.score) best = { score, keyword: asked, weak: false }
    }

    if (best) {
      hits.push({
        kind: 'reg', id: r.id, title: r.title, clause_no: r.clause_no, content: r.content,
        citation: `《${r.title}》${r.clause_no}`,
        score: best.score * 1.3, // 条款原文优先于分级标准的概括描述
        keyword: best.keyword, weak: best.weak
      })
    }
  }

  /* --- 物品分级标准（覆盖规章条文未列明、但标准库已定级的物品，如打火机） --- */
  for (const s of stds) {
    const names = String(s.name || '').split(/[、，,/]/).map((x) => x.trim()).filter(Boolean)
    let best = null

    for (const n of names) {
      const nn = normalize(n)
      if (!nn || !q.includes(nn)) continue
      const score = nn.length ** 2 * (nn.length === 1 ? 0.15 : 1)
      if (!best || score > best.score) best = { score, keyword: n, weak: nn.length === 1 }
    }

    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      const mapped = names.some((n) => normalize(n) === normalize(canonical) || normalize(n).includes(normalize(canonical)))
      if (!mapped) continue
      const asked = [canonical, ...aliases].find((t) => q.includes(normalize(t)))
      if (!asked) continue
      const score = normalize(asked).length ** 2 * 1.2
      if (!best || score > best.score) best = { score, keyword: asked, weak: false }
    }

    if (best) {
      hits.push({
        kind: 'std', id: s.id, title: s.category, clause_no: s.clause, level: s.level,
        disposal: s.disposal, items: s.name,
        citation: `${s.clause}（物品分级：${s.level}）`,
        content: `${s.level}｜${s.category}：${s.name}；处置方式：${s.disposal}`,
        score: best.score, keyword: best.keyword, weak: best.weak
      })
    }
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, topK)
}

/** 组装知识库上下文：规章条文 + 物品分级标准，数据量小，全量注入 */
export function buildKnowledge(db) {
  const regs = db.prepare('SELECT * FROM regulations ORDER BY id').all()
  const std = db.prepare('SELECT * FROM standard_items ORDER BY id').all()

  const regText = regs
    .map((r, i) => `[R${i + 1}] 《${r.title}》${r.clause_no}（${r.category}）\n${r.content}`)
    .join('\n')

  const stdText = std
    .map((s) => `- ${s.level}｜${s.category}：${s.name} → 处置：${s.disposal}（依据 ${s.clause}）`)
    .join('\n')

  return { regText, stdText, regs, std }
}

/* ===================== 提示词 ===================== */

const SYSTEM_PROMPT = `你是广西警察学院学生宿舍管理中心的规章问答助手。你只依据【规章库】与【物品分级标准】作答，严禁编造条款、编号或处置措施。

回答要求：
1. 先用一句话给结论，明确属于「严禁 / 需申报 / 可以带」中的哪一种；随后用一句话说明依据。
2. 依据必须写成「《文件名》第 X 条」，只能引用资料里真实存在的条款。
3. 用户用的是口语或品牌叫法时，先归一到资料中的正式物品名再判断（例如"吹风筒"= 吹风机、"小太阳"= 电暖器、"电饭锅"= 电饭煲）。
4. 资料未覆盖的物品，明确说"规章库暂未收录该物品"，并建议提交物品申报或联系生活部人工确认，不要猜测。
5. 涉及安全风险（明火、易燃、管制刀具）时，结论要明确、不含糊。
6. 全文不超过 150 字，纯文本，不要使用 Markdown 标题、列表符号或加粗。`

export function buildMessages(question, kb, hits = []) {
  const hint = hits.length
    ? `\n\n【检索提示】与本次提问最相关的依据：${hits.map((h) => h.citation).join('；')}`
    : '\n\n【检索提示】没有匹配到相关条款，请如实说明规章库未收录。'

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `【规章库】\n${kb.regText}\n\n【物品分级标准】\n${kb.stdText}${hint}`
    },
    { role: 'user', content: String(question).slice(0, 500) }
  ]
}

/* ===================== 调用 ===================== */

export class AiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'AiError'
  }
}

function classify(status, bodyText) {
  if (status === 401 || status === 403) {
    return new AiError('AUTH', 'AI 服务鉴权失败，请检查 AI_API_KEY 是否正确')
  }
  if (status === 429) {
    return new AiError('RATE_LIMIT', 'AI 服务调用频繁，请稍后再试')
  }
  if (status === 404) {
    return new AiError('MODEL', `AI 模型或接口地址不存在，请检查 AI_MODEL / AI_BASE_URL（${bodyText.slice(0, 120)}）`)
  }
  if (status >= 500) {
    return new AiError('UPSTREAM', 'AI 服务暂时不可用，请稍后重试')
  }
  return new AiError('HTTP', `AI 服务返回异常（${status}）：${bodyText.slice(0, 120)}`)
}

/**
 * 流式对话
 * @param {object}   opts
 * @param {Array}    opts.messages   OpenAI 格式消息数组
 * @param {Function} opts.onDelta    每收到一段文本回调
 * @param {AbortSignal} opts.signal  外部中断信号（客户端断开时触发）
 * @returns {Promise<{text:string, usage:object|null}>}
 */
export async function chatStream({ messages, onDelta, signal }) {
  const cfg = aiConfig()
  if (!cfg.apiKey) throw new AiError('NO_KEY', 'AI 服务未配置')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new AiError('TIMEOUT', 'AI 响应超时')), cfg.timeoutMs)
  const onAbort = () => ctrl.abort(new AiError('ABORTED', '请求已取消'))
  if (signal) signal.addEventListener('abort', onAbort, { once: true })

  let res
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens
      }),
      signal: ctrl.signal
    })
  } catch (err) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    // abort(reason) 时 fetch 会直接抛出该 reason，需先于 AbortError 判断
    if (err instanceof AiError) throw err
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
      if (ctrl.signal.reason instanceof AiError) throw ctrl.signal.reason
      throw new AiError('ABORTED', '请求已取消')
    }
    throw new AiError('NETWORK', '无法连接 AI 服务，请检查服务器网络或 AI_BASE_URL')
  }

  if (!res.ok) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    const text = await res.text().catch(() => '')
    throw classify(res.status, text)
  }

  // 解析 SSE：buf 累积，按换行切分，兼容跨 chunk 截断
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let text = ''
  let usage = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let json
        try {
          json = JSON.parse(payload)
        } catch {
          continue
        }
        if (json.usage) usage = json.usage
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          text += delta
          onDelta?.(delta)
        }
      }
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock?.()
  }

  return { text, usage }
}

/** 非流式（无 SSE 需求时使用，如批量回归测试） */
export async function chatOnce({ messages }) {
  const cfg = aiConfig()
  if (!cfg.apiKey) throw new AiError('NO_KEY', 'AI 服务未配置')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens
      }),
      signal: ctrl.signal
    })
    if (!res.ok) throw classify(res.status, await res.text().catch(() => ''))
    const data = await res.json()
    return { text: data.choices?.[0]?.message?.content || '', usage: data.usage || null }
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err?.name === 'AbortError') throw new AiError('TIMEOUT', 'AI 响应超时')
    throw new AiError('NETWORK', '无法连接 AI 服务，请检查服务器网络或 AI_BASE_URL')
  } finally {
    clearTimeout(timer)
  }
}

/* ===================== 降级：本地规则回答 ===================== */

export function localAnswer(question, hits) {
  const top = hits[0]
  if (!top) {
    return '现有规章文件未覆盖该物品，已转生活部人工问询，通常 1 个工作日内答复。'
  }
  if (top.kind === 'std') {
    return `该物品属【${top.level}】${top.title}类，${top.disposal}。依据：${top.clause_no}。`
  }
  if (top.weak) {
    return `可能适用《${top.title}》${top.clause_no}：${top.content}\n（关键词匹配未完全确认，建议同时提交物品申报或联系生活部核实）`
  }
  return `依据《${top.title}》${top.clause_no}：${top.content}`
}
