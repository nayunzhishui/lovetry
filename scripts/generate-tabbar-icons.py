# -*- coding: utf-8 -*-
"""生成 tabBar 线性图标（81x81 PNG，4x 超采样抗锯齿）。

四个 tab：今天=太阳、日历=日历格、记录=书页、我们=双心。
亮色 / 暗色各一套（theme.json 按主题引用），共 16 张：
  <name>.png / <name>-active.png / <name>-dark.png / <name>-active-dark.png
运行：python3 scripts/generate-tabbar-icons.py
"""
import math
import os

from PIL import Image, ImageDraw

SIZE = 81           # 输出尺寸
SCALE = 4           # 超采样倍数
CANVAS = SIZE * SCALE
STROKE = 5 * SCALE  # 线宽约 5px
# 图标视觉主体约占 60%：以画布中心为原点，半幅约 0.30 * CANVAS
HALF = CANVAS * 0.30
CX = CY = CANVAS / 2

COLORS = {
    "": "#68767A",             # 亮色·常态
    "-active": "#1F2D31",      # 亮色·选中
    "-dark": "#94A5A2",        # 暗色·常态
    "-active-dark": "#EEF4F2"  # 暗色·选中
}

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "couple-miniprogram", "miniprogram", "assets", "tabbar"
)


def canvas():
    return Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))


def ellipse(draw, x, y, r, color, width=STROKE):
    draw.ellipse([x - r, y - r, x + r, y + r], outline=color, width=width)


def draw_today(draw, color):
    """太阳：圆盘 + 八根短射线。"""
    r = HALF * 0.52
    ellipse(draw, CX, CY, r, color)
    inner = r + STROKE * 1.35
    outer = HALF * 1.06
    for i in range(8):
        angle = math.pi / 4 * i
        x1 = CX + inner * math.cos(angle)
        y1 = CY + inner * math.sin(angle)
        x2 = CX + outer * math.cos(angle)
        y2 = CY + outer * math.sin(angle)
        draw.line([x1, y1, x2, y2], fill=color, width=STROKE)


def draw_calendar(draw, color):
    """日历：圆角外框 + 顶部装订轴 + 表头线 + 两枚日期点。"""
    left, right = CX - HALF, CX + HALF
    top, bottom = CY - HALF * 0.86, CY + HALF * 0.98
    radius = STROKE * 1.6
    draw.rounded_rectangle([left, top, right, bottom], radius=radius, outline=color, width=STROKE)
    header_y = top + (bottom - top) * 0.32
    draw.line([left, header_y, right, header_y], fill=color, width=STROKE)
    # 装订轴
    for x in (CX - HALF * 0.45, CX + HALF * 0.45):
        draw.line([x, top - STROKE * 1.7, x, top + STROKE * 0.4], fill=color, width=STROKE)
    # 日期点
    dot = STROKE * 0.62
    for i, (dx, dy) in enumerate([(-0.42, 0.32), (0.0, 0.32), (0.42, 0.32), (-0.42, 0.72), (0.0, 0.72)]):
        x = CX + HALF * dx
        y = top + (bottom - top) * dy
        draw.ellipse([x - dot, y - dot, x + dot, y + dot], fill=color)


def draw_records(draw, color):
    """书页：圆角页框 + 右上折角 + 三行文字线。"""
    left, right = CX - HALF * 0.82, CX + HALF * 0.82
    top, bottom = CY - HALF, CY + HALF
    fold = HALF * 0.62
    radius = STROKE * 1.4
    # 页面轮廓（右上角折角）
    draw.line([left + radius, top, right - fold, top], fill=color, width=STROKE)
    draw.line([right - fold, top, right, top + fold], fill=color, width=STROKE)
    draw.line([right, top + fold, right, bottom - radius], fill=color, width=STROKE)
    draw.arc([right - radius * 2, bottom - radius * 2, right, bottom], 0, 90, fill=color, width=STROKE)
    draw.line([right - radius, bottom, left + radius, bottom], fill=color, width=STROKE)
    draw.arc([left, bottom - radius * 2, left + radius * 2, bottom], 90, 180, fill=color, width=STROKE)
    draw.line([left, bottom - radius, left, top + radius], fill=color, width=STROKE)
    draw.arc([left, top, left + radius * 2, top + radius * 2], 180, 270, fill=color, width=STROKE)
    # 折角斜线
    draw.line([right - fold, top, right - fold, top + fold], fill=color, width=int(STROKE * 0.8))
    draw.line([right - fold, top + fold, right, top + fold], fill=color, width=int(STROKE * 0.8))
    # 文字行
    for dy in (0.12, 0.38, 0.64):
        y = top + (bottom - top) * (0.28 + dy * 0.72)
        draw.line([left + HALF * 0.32, y, right - HALF * 0.32, y], fill=color, width=STROKE)


def heart_points(cx, cy, size, steps=120):
    """经典心形参数曲线，size 控制半幅。"""
    points = []
    for i in range(steps + 1):
        t = math.pi * 2 * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        points.append((cx + x * size / 16, cy - y * size / 16))
    return points


def draw_us(draw, color):
    """双心：一大一小两颗描边心形，轻微交叠。"""
    big = heart_points(CX - HALF * 0.30, CY - HALF * 0.06, HALF * 0.72)
    small = heart_points(CX + HALF * 0.44, CY + HALF * 0.26, HALF * 0.46)
    draw.line(big + [big[0]], fill=color, width=STROKE, joint="curve")
    draw.line(small + [small[0]], fill=color, width=STROKE, joint="curve")


ICONS = {
    "today": draw_today,
    "calendar": draw_calendar,
    "records": draw_records,
    "us": draw_us
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    generated = []
    for name, painter in ICONS.items():
        for suffix, color in COLORS.items():
            image = canvas()
            painter(ImageDraw.Draw(image), color)
            image = image.resize((SIZE, SIZE), Image.LANCZOS)
            # 命名规则：today.png / today-active.png / today-dark.png / today-active-dark.png
            file_name = f"{name}{suffix}.png"
            path = os.path.join(OUT_DIR, file_name)
            image.save(path, "PNG")
            generated.append(path)
    # 自检：尺寸正确且非空
    for path in generated:
        with Image.open(path) as image:
            assert image.size == (SIZE, SIZE), f"{path} 尺寸错误: {image.size}"
            assert image.getbbox() is not None, f"{path} 内容为空"
        assert os.path.getsize(path) > 200, f"{path} 文件过小"
    print(f"已生成 {len(generated)} 张 {SIZE}x{SIZE} 图标于 {OUT_DIR}")


if __name__ == "__main__":
    main()
