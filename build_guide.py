# -*- coding: utf-8 -*-
"""WorkBuddy 0.2.0 安装与使用 · 新手完全指南 PDF（reportlab）。
   铁律：step() 步骤体只含 Paragraph；callout/code_block 一律独立追加，绝不嵌套进单元格。"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ---------- 字体 ----------
F = 'C:/Windows/Fonts'
pdfmetrics.registerFont(TTFont('MSYH',   F + '/msyh.ttc',   subfontIndex=0))
pdfmetrics.registerFont(TTFont('MSYHBD', F + '/msyhbd.ttc', subfontIndex=0))
registerFontFamily('MSYH', normal='MSYH', bold='MSYHBD', italic='MSYH', boldItalic='MSYHBD')

# ---------- 颜色 ----------
def HC(h): return HexColor(h)
C_PRIMARY = '#2563EB'; C_NAVY = '#1E3A8A'
C_TEXT = '#1F2937'; C_MUTED = '#6B7280'; C_LINE = '#E5E7EB'; C_CODE_BG = '#F3F4F6'; C_STEP_BG = '#F8FAFC'

PAGE_W, PAGE_H = A4
MARGIN = 1.9 * cm
CW = PAGE_W - 2 * MARGIN

def ps(name, **kw):
    base = dict(fontName='MSYH', fontSize=11.2, leading=18, textColor=HC(C_TEXT))
    base.update(kw); return ParagraphStyle(name, **base)

S_COVER_KICK = ps('ck', fontName='MSYHBD', fontSize=12, leading=18, textColor=HC('#BFDBFE'), alignment=TA_CENTER)
S_COVER_T    = ps('ct', fontName='MSYHBD', fontSize=40, leading=50, textColor=HC('#FFFFFF'), alignment=TA_CENTER)
S_COVER_SUB  = ps('cs', fontName='MSYH', fontSize=14, leading=22, textColor=HC('#E0E7FF'), alignment=TA_CENTER)
S_COVER_META = ps('cm', fontName='MSYH', fontSize=11, leading=18, textColor=HC('#C7D2FE'), alignment=TA_CENTER)
S_H1   = ps('h1', fontName='MSYHBD', fontSize=19, leading=26, textColor=HC('#FFFFFF'))
S_H2   = ps('h2', fontName='MSYHBD', fontSize=14, leading=22, textColor=HC(C_PRIMARY), spaceBefore=10, spaceAfter=4)
S_BODY = ps('body', fontSize=11.5, leading=19)
S_LEAD = ps('lead', fontSize=11.5, leading=19, textColor=HC(C_MUTED))
S_STEP_T = ps('stt', fontName='MSYHBD', fontSize=13.5, leading=20, textColor=HC(C_TEXT))
S_CL_T = ps('clt', fontName='MSYHBD', fontSize=11.5, leading=17)
S_CL   = ps('cl', fontSize=11, leading=17.5)
S_CODE = ps('code', fontName='MSYH', fontSize=10.5, leading=16, textColor=HC(C_TEXT))
S_Q    = ps('q', fontName='MSYHBD', fontSize=12, leading=18, textColor=HC(C_PRIMARY))
S_TOC  = ps('toc', fontSize=12, leading=24, textColor=HC(C_TEXT))
S_GLOSS= ps('gl', fontSize=11, leading=18)

story = []

# ---------- 构件 ----------
def section_bar(num_text, title):
    cell = [Paragraph(f'第 {num_text} 部分', ps('hn', fontSize=12, leading=16, textColor=HC('#BFDBFE'))),
            Paragraph(title, S_H1)]
    t = Table([[cell]], colWidths=[CW])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HC(C_PRIMARY)),
        ('LEFTPADDING', (0,0), (-1,-1), 16), ('RIGHTPADDING', (0,0), (-1,-1), 16),
        ('TOPPADDING', (0,0), (-1,-1), 12), ('BOTTOMPADDING', (0,0), (-1,-1), 13),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    return t

def callout(kind, title, body):
    cfg = {
        'warn':    ('#D97706','#FEF3C7','【注意】'),
        'danger':  ('#DC2626','#FEE2E2','【警告】'),
        'tip':     ('#0891B2','#ECFEFF','【小贴士】'),
        'success': ('#16A34A','#DCFCE7','【成功】'),
        'info':    ('#2563EB','#DBEAFE','【说明】'),
    }[kind]
    accent_hex, bg_hex, label = cfg
    inner = [Paragraph(f'<font color="{accent_hex}"><b>{label} {title}</b></font>', S_CL_T), Spacer(1, 3)]
    if isinstance(body, str):
        inner.append(Paragraph(body, S_CL))
    else:
        inner.extend(body)
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HC(bg_hex)),
        ('LINEBEFORE', (0,0), (0,-1), 3.5, HC(accent_hex)),
        ('LEFTPADDING', (0,0), (-1,-1), 13), ('RIGHTPADDING', (0,0), (-1,-1), 13),
        ('TOPPADDING', (0,0), (-1,-1), 9), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    return KeepTogether([t, Spacer(1, 8)])

def step(num, title, body):
    """body 只能是 str 或 list[Paragraph]，绝不含 Table/KeepTogether。"""
    elems = [Paragraph(f'<font color="#2563EB" size=16><b>{num}</b></font>　<b>{title}</b>', S_STEP_T),
             Spacer(1, 4)]
    if isinstance(body, str):
        elems.append(Paragraph(body, S_BODY))
    else:
        elems.extend(body)
    elems.append(Spacer(1, 10))
    return KeepTogether(elems)

def code_block(lines):
    inner = [Paragraph('<br/>'.join(lines), S_CODE)]
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HC(C_CODE_BG)),
        ('LEFTPADDING', (0,0), (-1,-1), 13), ('RIGHTPADDING', (0,0), (-1,-1), 13),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    return t

def gap(h=6): return Spacer(1, h)
def P(t, s=S_BODY): return Paragraph(t, s)

# ======================================================================
# 封面
# ======================================================================
hero = Table([[
    [Paragraph('WORKBUDDY · 新手完全指南', S_COVER_KICK), Spacer(1, 26),
     Paragraph('安装与使用', S_COVER_T), Spacer(1, 10),
     Paragraph('从收到文件，到每天使用', S_COVER_T), Spacer(1, 30),
     Paragraph('一步一步教你 · 看不懂电脑也能跟着做', S_COVER_SUB), Spacer(1, 10),
     Paragraph('版本 0.2.0 ｜ 适用于 Windows 10 / 11 电脑', S_COVER_META)]
]], colWidths=[CW], rowHeights=[PAGE_H - 2 * MARGIN - 1.0*cm])
hero.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), HC(C_NAVY)), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
]))
story.append(hero); story.append(PageBreak())

# ======================================================================
# 读我 + 目录 + 词典
# ======================================================================
story.append(Paragraph('开始之前，请先读这一页',
         ps('t0', fontName='MSYHBD', fontSize=18, leading=26, textColor=HC(C_PRIMARY), spaceAfter=6)))
story.append(Spacer(1, 4))
story.append(callout('info', '这份指南是写给谁看的',
    '写给<b>完全没用过这类软件</b>的朋友。每一步都写得很细，<b>按顺序照着做</b>就行。'
    '看不懂的词，下面"小词典"有解释；遇到麻烦，翻到<b>第四部分 常见问题</b>。慢一点没关系，一定能装好。'))
story.append(Spacer(1, 6))
story.append(Paragraph('小词典（先认识几个词）', S_H2))
gloss = [
    ['双击', '用食指<b>快速</b>点鼠标左键两下（是两下，不是一下）。打开软件、打开文件都用它。'],
    ['单击', '点鼠标左键一下。'],
    ['右键', '点鼠标<b>右键</b>一下，会弹出一个小菜单。'],
    ['桌面', '电脑开机后看到的、放着各种图标的背景画面。'],
    ['文件夹', '装文件的"盒子"，图标通常是<b>黄色</b>的小袋子。'],
    ['窗口', '一个软件打开后，出现的那个方框。'],
    ['图标', '桌面上或文件夹里，代表软件 / 文件的小图案。'],
]
gt = Table([[Paragraph(f'<b>{k}</b>', S_GLOSS), Paragraph(v, S_GLOSS)] for k, v in gloss],
           colWidths=[2.0*cm, CW - 2.0*cm])
gt.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'TOP'), ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ('LEFTPADDING', (0,0), (-1,-1), 0), ('LINEBELOW', (0,0), (-1,-2), 0.5, HC(C_LINE)),
]))
story.append(gt); story.append(gap(10))
story.append(Paragraph('你将经历四个部分', S_H2))
toc = [
    ('第一部分', '安装（约 5 分钟）', '从微信收到文件，到装好、打开软件'),
    ('第二部分', '第一次设置', '填称呼、可选配 AI，3 步搞定'),
    ('第三部分', '每天怎么用', '写计划、打勾、做复盘，每天 5 分钟'),
    ('第四部分', '常见问题', '遇到困难，先翻这里找答案'),
]
toct = Table([[Paragraph(f'<font color="#2563EB"><b>{a}</b></font>', S_TOC),
               Paragraph(b, ps('tb', fontName='MSYHBD', fontSize=12, leading=22)),
               Paragraph(c, ps('tc', fontSize=10.5, leading=18, textColor=HC(C_MUTED)))] for a, b, c in toc],
             colWidths=[2.4*cm, 4.0*cm, CW - 6.4*cm])
toct.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ('LINEBELOW', (0,0), (-1,-2), 0.5, HC(C_LINE)),
]))
story.append(toct); story.append(PageBreak())

# ======================================================================
# 第一部分 安装
# ======================================================================
story.append(section_bar('一', '安装（从收到文件到打开软件）')); story.append(gap(8))
story.append(P('下面 6 步，大约 5 分钟完成。遇到蓝色的"Windows 已保护你的电脑"提示<b>不要慌</b>，那是正常的（第 4 步会专门讲）。', S_LEAD))
story.append(gap(6))

story.append(step(1, '找到朋友发给你的文件',
    '朋友通过微信发给你一个<b>压缩包</b>（名字大概叫 <b>workbuddy.zip</b>）。先把它"拿"到电脑里：'
    '<br/>① 用<b>电脑版微信</b>打开和朋友的聊天窗口，找到那个文件。'
    '<br/>② 鼠标放文件上，<b>右键</b> → 点【在文件夹中显示】。'
    '<br/>③ 电脑会打开一个文件夹，里面就有这个文件了。'))
story.append(callout('tip', '找不到文件在哪？', '看<b>第四部分 问题 1</b>，里面有"微信文件在哪里"的查找方法。'))

story.append(step(2, '解压压缩包（一定要先"拆开"）',
    '你收到的是 .zip 压缩包，必须先解压，<b>不能</b>直接在里面双击。'
    '<br/>① <b>右键</b>点 workbuddy.zip。'
    '<br/>② 菜单里选【<b>全部解压缩</b>】（Windows 自带功能）。'
    '<br/>③ 弹出窗口后，直接点右下角【<b>提取</b>】（有的电脑叫"解压"）。'
    '<br/>④ 完成后，旁边会多出一个叫 <b>workbuddy</b> 的<b>文件夹</b>。'))
story.append(callout('warn', '别偷懒直接在压缩包里点',
    '如果不去"全部解压缩"，直接在 zip 里双击里面的文件，<b>很可能装不上或报错</b>。请务必先解压成一个文件夹。'))

story.append(step(3, '打开安装程序',
    '① <b>双击</b>打开刚解压出来的 <b>workbuddy</b> 文件夹。'
    '<br/>② 里面有一个文件叫 <b>WorkBuddy-Setup-0.2.0.exe</b>（图标是蓝色应用图案）。'
    '<br/>③ <b>双击</b>它，开始安装。'))
story.append(callout('info', '如果弹窗问"是否允许此应用更改你的设备"', '点【<b>是</b>】即可。这是 Windows 的常规确认，不是报错。'))

story.append(step(4, '【最关键】通过 Windows 蓝色安全提示',
    '双击后，屏幕<b>可能变蓝</b>，弹出这样一个窗口（见下方灰框）。看到它<b>千万别关、千万别以为中毒了</b>。'))
story.append(code_block(['<b>Windows 已保护你的电脑</b>',
                         'Microsoft Defender SmartScreen 阻止了无法识别的应用启动。']))
story.append(gap(3))
story.append(callout('danger', '这是正常现象，不是病毒！',
    '因为这个软件是个人作品，<b>没有花钱买"数字签名"</b>（大多数个人 / 小团队软件都不签名），'
    'Windows 就会谨慎地拦一下提示你。<b>软件本身是安全的</b>，放心往下做。'))
story.append(callout('success', '你要做的 3 个动作',
    '<b>①</b> 在蓝色窗口中间的<b>空白处，单击一下左键</b>（让隐藏的选项展开）。<br/>'
    '<b>②</b> 会出现一行较小的字【<b>更多信息</b>】，点它。<br/>'
    '<b>③</b> 接着出现一个按钮【<b>仍要运行</b>】，点它，就开始安装了。<br/>'
    '<font color="#6B7280">（有的一开始就能看见"更多信息"，直接点它即可。）</font>'))

story.append(step(5, '跟着安装向导走',
    '过了安全提示，会出现安装向导，一路点下去：'
    '<br/>① 选安装位置：<b>直接用默认的就行</b>，点【<b>下一步</b>】（想换地方可点"浏览"）。'
    '<br/>② 看到【创建桌面快捷方式】——默认已勾，<b>保持不动</b>。'
    '<br/>③ 点【<b>安装</b>】，等十几秒。'
    '<br/>④ 出现"完成"，点【<b>完成</b>】。'))

story.append(step(6, '找到并打开软件',
    '安装完成后：'
    '<br/>① 回到电脑<b>桌面</b>。'
    '<br/>② 会多出一个蓝色图标，名字叫【<b>WorkBuddy</b>】。'
    '<br/>③ <b>双击</b>它，软件就打开了！'))
story.append(callout('success', '恭喜，安装完成！', '请翻到下一页【第二部分】，做第一次设置（很快）。'))
story.append(PageBreak())

# ======================================================================
# 第二部分 第一次设置
# ======================================================================
story.append(section_bar('二', '第一次打开与设置（3 步搞定）')); story.append(gap(8))
story.append(P('第一次打开软件，里面是<b>空的</b>，这是正常的。按下面 3 步设置一下就能用了。', S_LEAD))
story.append(gap(6))

story.append(step(1, '填你的称呼',
    '① 看软件<b>左边一排菜单</b>，点【<b>设置</b>】（齿轮图标）。'
    '<br/>② 在【通用】里，"你的称呼"那一栏，填一个名字（比如"小明"）。软件会用这个名字跟你打招呼。'
    '<br/>③ 点【<b>保存</b>】。'))

story.append(callout('info', '第 2 步是【可选】的',
    '<b>计划、待办、打勾、日复盘</b>这些基础功能，<b>不配 AI 也能正常用</b>（完全离线免费）。'
    '只有两个功能需要配 AI：「<b>AI 帮我写周/月复盘</b>」「<b>AI 引导我制定计划</b>」。'
    '现在不想配可以跳过，以后随时能在设置里补。'))
story.append(step(2, '【可选】配置 AI',
    '<b>如果要配 AI，怎么做：</b>'
    '<br/>① 还在【设置】页，找【<b>AI 配置</b>】区域。'
    '<br/>② 填三样东西：<b>Base URL</b>（接口地址）、<b>Model</b>（模型名）、<b>API Key</b>（密钥）。'
    '<br/>③ 这三样要你去 AI 平台申请（如智谱、DeepSeek、OpenAI 等），朋友会告诉你用哪个。'
    '<br/>④ 填完点【<b>测试连接</b>】，显示绿色"成功"就对了。'))
story.append(callout('warn', 'API Key 是你的私密钥匙', 'API Key 只存在<b>你这台电脑上（已加密）</b>，<b>不要截图发给别人</b>。'))

story.append(step(3, '回到主界面，开始用',
    '① 点左边菜单【<b>今日总览</b>】（小房子图标）。'
    '<br/>② 第一次进去是空的，因为还没写计划——正常的。'
    '<br/>③ 点里面的【<b>写今日计划</b>】，或左边【<b>规划</b>】，正式开始用。'))
story.append(callout('success', '设置完成！', '接下来看【第三部分】，学会每天怎么用（每天只要 5 分钟）。'))
story.append(PageBreak())

# ======================================================================
# 第三部分 日常使用
# ======================================================================
story.append(section_bar('三', '每天怎么用（每天 5 分钟）')); story.append(gap(8))
story.append(P('安装、设置都好了之后，每天这样用就行。先学最常用的，进阶的以后再说。', S_LEAD))
story.append(gap(8))

story.append(Paragraph('场景 A · 每天早上：写今天的计划', S_H2))
story.append(P('① 打开 WorkBuddy，点左边【<b>规划</b>】→【<b>日规划</b>】。<br/>'
               '② 中间会出现一个"日计划"模板。<br/>'
               '③ 在"任务"那一块下面，写你今天要做的事，<b>每件事前面加上</b> <font face="MSYHBD">- [ ]</font>：'))
story.append(code_block(['## 任务', '- [ ] 写完季度报告', '- [ ] 给老王打电话确认会议', '- [ ] 健身 30 分钟']))
story.append(gap(4))
story.append(P('④ 写完，点右上角【<b>保存</b>】。'))
story.append(callout('success', '保存后', '这些事会<b>自动</b>出现在【今日总览】的"待办"里，不用你手动加。'))
story.append(gap(8))

story.append(Paragraph('场景 B · 做完一件事：打个勾', S_H2))
story.append(P('回到【<b>今日总览</b>】，每做完一件事，就<b>点它前面的小方框</b>，从空框 ☐ 变成打勾 ☑。'
               '打勾 = 这件事做完了，会自动归到"已完成"。'))
story.append(gap(8))

story.append(Paragraph('场景 C · 晚上：做个简单复盘', S_H2))
story.append(P('① 点【<b>规划</b>】→【<b>日规划</b>】，页面下方有【<b>复盘</b>】区域。<br/>'
               '② 写两句今天做得怎么样、明天注意什么。<b>不用写多</b>，两三句就行。<br/>'
               '③ （配了 AI 的朋友，可以点【AI 汇总】让它帮你写。）'))
story.append(gap(8))

story.append(Paragraph('场景 D · 周末：做下周计划（进阶，以后再学）', S_H2))
story.append(callout('tip', '这一节可以先跳过', '先把每天的"写计划 → 打勾 → 复盘"用熟，周末计划<b>以后再学</b>也不迟。'))
story.append(P('① <b>周日</b>，点【<b>规划</b>】→【<b>周统筹</b>】，写下周的大目标。<br/>'
               '② 平时做【日规划】时，<b>右边会列出你的"本周任务"</b>，点【<b>选取</b>】就能把某个周目标搬到今天。<br/>'
               '③ 月底同理，有【<b>月指导</b>】。<br/>'
               '④ 周日 / 月底，【今日总览】会出现提醒待办，带【前往】按钮直达。'))
story.append(PageBreak())

# ======================================================================
# 第四部分 常见问题
# ======================================================================
story.append(section_bar('四', '常见问题（遇到困难先看这里）')); story.append(gap(8))
story.append(P('按顺序找你遇到的问题。大多数麻烦，这里都有答案。', S_LEAD))
story.append(gap(8))

def qa(q, a):
    blk = [Paragraph('问：' + q, S_Q), Spacer(1, 3), Paragraph('答：' + a, S_BODY)]
    t = Table([[blk]], colWidths=[CW])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HC('#F9FAFB')), ('LINEBEFORE', (0,0), (0,-1), 3, HC(C_PRIMARY)),
        ('LEFTPADDING', (0,0), (-1,-1), 13), ('RIGHTPADDING', (0,0), (-1,-1), 13),
        ('TOPPADDING', (0,0), (-1,-1), 9), ('BOTTOMPADDING', (0,0), (-1,-1), 9),
    ]))
    return KeepTogether([t, Spacer(1, 8)])

story.append(qa('1. 微信收到的文件，到底在电脑哪里？',
    '最简单的办法：在聊天里<b>右键</b>那个文件 →【<b>在文件夹中显示</b>】，电脑会直接打开它所在的文件夹。<br/>'
    '或者：电脑版微信 → 左下角【<b>三条横线 / 设置</b>】→【<b>文件管理</b>】→【<b>打开文件夹</b>】，文件一般在里面的 FileStorage 文件夹下。'))
story.append(qa('2. 双击安装包，没反应 / 一闪而过？',
    '先确认你<b>解压过了</b>（见第一部分第 2 步），<b>不要</b>直接在 zip 里双击。'
    '如果解压了还没反应，可能是被杀毒软件拦了——看下面的<b>问题 6</b>。'))
story.append(qa('3. 弹出"Windows 已保护你的电脑"蓝色窗口？',
    '<b>正常现象</b>，不是病毒。点【<b>更多信息</b>】→【<b>仍要运行</b>】即可（详见第一部分第 4 步）。'))
story.append(qa('4. 打开软件后白屏 / 一直转圈？',
    '先<b>关掉重新打开</b>一次。还不行，<b>重启电脑</b>再试。'
    '注意：软件需要 <b>Windows 10 或 11 的 64 位</b>系统，太旧的系统可能跑不起来。'))
story.append(qa('5. 提示"缺少 xxx.dll 文件"？',
    '你的系统少了一个运行库。去网上搜索"<b>VC++ 2015-2022 Redistributable x64</b>"，下载安装后，再重新打开 WorkBuddy。'))
story.append(qa('6. 杀毒软件（360 / 火绒 / 电脑管家）把它删了或拦截了？',
    '这是<b>误报</b>（因为软件没签名，会被个别杀软误判）。'
    '在杀毒软件里找到它，选【<b>信任 / 加入白名单 / 恢复</b>】，然后重新双击安装包即可。软件是安全的。'))
story.append(qa('7. 我的数据存在哪？重装 / 换电脑会丢吗？',
    '数据在你电脑的 <font face="MSYHBD">C:\\Users\\你的用户名\\AppData\\Roaming\\workbuddy\\</font> 里。<br/>'
    '卸载软件<b>不会</b>删数据；重装后数据还在。<br/>'
    '想换电脑：用软件里【设置】→【<b>数据管理</b>】→【<b>导出</b>】存一份，到新电脑【<b>导入</b>】即可。'))
story.append(qa('8. 怎么卸载？',
    '电脑【<b>设置</b>】→【<b>应用</b>】→ 搜【WorkBuddy】→【<b>卸载</b>】。'
    '或在安装目录里运行 <b>Uninstall WorkBuddy.exe</b>。卸载不会删你的数据。'))
story.append(qa('9. AI 功能用不了 / 报错？',
    '先确认你<b>第二部分第 2 步</b>配过 AI，并且【测试连接】显示成功。'
    '还是不行，多半是<b>网络问题</b>，或 API Key / 地址填错了——回头检查这三项。'))
story.append(qa('10. 还是不行，怎么办？',
    '别急。<b>直接微信问发给你这个软件的朋友</b>，把屏幕上看到的画面<b>截图</b>发过去，对方会帮你看。'))

story.append(gap(10))
story.append(callout('info', '写在最后',
    '这个软件的所有数据都<b>存在你自己的电脑上</b>，不会上传云端，安全可靠。'
    '第一次安装可能有点小麻烦（主要是那个蓝色安全提示），但只要按这份指南做，一次就能装好。'
    '装好后，每天用起来就很简单了。祝你用得顺手！'))

# ---------- 页脚 ----------
def on_later(canvas, doc):
    canvas.saveState()
    canvas.setFont('MSYH', 8.5)
    canvas.setFillColor(HC(C_MUTED))
    canvas.drawCentredString(PAGE_W/2, 1.0*cm, f'WorkBuddy 0.2.0 · 新手完全指南　·　第 {doc.page} 页')
    canvas.restoreState()
def on_first(canvas, doc): pass

OUT = r'E:\workbuddy v0.2 测试版本\workbuddy\WorkBuddy安装与使用指南.pdf'
doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                        topMargin=1.5*cm, bottomMargin=1.5*cm,
                        title='WorkBuddy 安装与使用指南', author='WorkBuddy')
doc.build(story, onFirstPage=on_first, onLaterPages=on_later)
print('OK ->', OUT, os.path.getsize(OUT), 'bytes')
