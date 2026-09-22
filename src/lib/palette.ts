/** 课程配色：iOS 系统色调的柔和变体 */

export interface CourseColor {
  name: string
  /** 主色（文字 / 图标） */
  solid: string
  /** 卡片背景渐变起点 */
  from: string
  /** 卡片背景渐变终点 */
  to: string
  /** 边框 */
  ring: string
  /** 深色文字，保证在浅底上可读 */
  text: string
}

export const COURSE_PALETTE: CourseColor[] = [
  {
    name: 'blue',
    solid: '#0A84FF',
    from: '#E8F2FF',
    to: '#D3E7FF',
    ring: '#B9D8FF',
    text: '#0B4A94',
  },
  {
    name: 'indigo',
    solid: '#5E5CE6',
    from: '#EDEDFF',
    to: '#DEDDFF',
    ring: '#C7C5FF',
    text: '#3B3A9E',
  },
  {
    name: 'purple',
    solid: '#AF52DE',
    from: '#F7EBFF',
    to: '#EED9FF',
    ring: '#DFC0FA',
    text: '#7A2CA0',
  },
  {
    name: 'pink',
    solid: '#FF2D55',
    from: '#FFECF1',
    to: '#FFD9E2',
    ring: '#FFC2D1',
    text: '#A8123A',
  },
  {
    name: 'orange',
    solid: '#FF9F0A',
    from: '#FFF4E3',
    to: '#FFE9C7',
    ring: '#FFD79A',
    text: '#96590A',
  },
  {
    name: 'yellow',
    solid: '#E5B800',
    from: '#FFF9E0',
    to: '#FFF2BC',
    ring: '#FFE58A',
    text: '#7A5C00',
  },
  {
    name: 'green',
    solid: '#34C759',
    from: '#EAFBEF',
    to: '#D3F5DE',
    ring: '#B4EAC5',
    text: '#17702F',
  },
  {
    name: 'teal',
    solid: '#30B0C7',
    from: '#E6F7FA',
    to: '#CDEEF4',
    ring: '#A8E0EA',
    text: '#10646F',
  },
  {
    name: 'mint',
    solid: '#00C7BE',
    from: '#E4FAF8',
    to: '#C8F4F0',
    ring: '#A0E9E3',
    text: '#046B66',
  },
  {
    name: 'brown',
    solid: '#A2845E',
    from: '#F8F2EA',
    to: '#EFE3D2',
    ring: '#DFCDB4',
    text: '#6B5540',
  },
  {
    name: 'graphite',
    solid: '#8E8E93',
    from: '#F4F4F6',
    to: '#E7E7EB',
    ring: '#D5D5DB',
    text: '#4A4A50',
  },
  {
    name: 'red',
    solid: '#FF3B30',
    from: '#FFEDEC',
    to: '#FFDAD7',
    ring: '#FFC2BD',
    text: '#A32219',
  },
]

export function colorOf(index: number | undefined): CourseColor {
  const i = typeof index === 'number' && Number.isFinite(index) ? index : 0
  return COURSE_PALETTE[((i % COURSE_PALETTE.length) + COURSE_PALETTE.length) % COURSE_PALETTE.length]
}
