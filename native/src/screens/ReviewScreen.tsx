import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Modal,
    Platform,
    PanResponder,
    KeyboardAvoidingView,
    ActivityIndicator,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReviewTask } from '../types'
import { calculateSM2, getNextDueDate } from '../lib/sm2'
import type { SM2Rating } from '../lib/sm2'
import { formatDateLabel, getStudyDay, getStudyDayDate, getTodayStart } from '../lib/date'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync as imageManipulateAsync, SaveFormat as ImageSaveFormat } from 'expo-image-manipulator'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Image } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReferenceBook, ReviewMaterial } from '../types'

const CROP_HANDLE_SIZE = 24
const CROP_EDGE_HIT = 14
const CROP_MIN_REL = 0.05
const MAX_THEME_FROM_IMAGE = 10
const MAX_IMAGE_BASE64_CHARS = 2_500_000
const INITIAL_CROP_RECT: CropRect = { x: 0.06, y: 0.12, width: 0.88, height: 0.68 }
type CropRect = { x: number; y: number; width: number; height: number }
type CropHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom' | 'left' | 'right' | 'center' | null

type QuizQuestion = {
    question: string
    choices: string[]
    correct_index: number
    explanation?: string
    theme?: string
}

type ThemeQuizState = {
    loading: boolean
    questions: QuizQuestion[]
    answers: Record<number, number>
    attemptIds?: Record<number, string>
}

type QuizState = {
    themes: Record<string, ThemeQuizState>
}

type PersistedReviewProgress = {
    skippedThemes: Record<string, string[]>
    completedThemesInTask: Record<string, string[]>
}

const getReviewProgressStorageKey = (id: string) => `review-progress:${id}`

export function ReviewScreen() {
    const { userId } = useProfile()
    const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([])
    const [quizByTask, setQuizByTask] = useState<Record<string, QuizState>>({})
    const [skippedThemes, setSkippedThemes] = useState<Record<string, string[]>>({})
    /** 1タスク内で「完璧/うろ覚え/苦手」を押したテーマ（全テーマ終わるまでタスクは消さない） */
    const [completedThemesInTask, setCompletedThemesInTask] = useState<Record<string, string[]>>({})
    /** テーマごとの評価（全テーマ終了時に一番厳しい評価でSM-2を更新） */
    const [themeRatingsInTask, setThemeRatingsInTask] = useState<Record<string, SM2Rating>>({})
    const [flashcardMode, setFlashcardMode] = useState<Record<string, boolean>>({})
    const [showingAnswer, setShowingAnswer] = useState<Record<string, boolean>>({})
    const [editingThemeKey, setEditingThemeKey] = useState<string | null>(null)
    const [editingThemeText, setEditingThemeText] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [isGeneratingBulk, setIsGeneratingBulk] = useState(false)
    const [showFutureModal, setShowFutureModal] = useState(false)
    const [futureTasks, setFutureTasks] = useState<any[]>([])
    const [futureTasksLoading, setFutureTasksLoading] = useState(false)
    const [showContentModal, setShowContentModal] = useState(false)
    const [contentMaterials, setContentMaterials] = useState<(ReviewMaterial & { study_date?: string | null })[]>([])
    const [editingContentTheme, setEditingContentTheme] = useState<{ materialId: string; lineIndex: number } | null>(null)
    const [editContentThemeText, setEditContentThemeText] = useState('')

    // Creation modal states
    const [showCreateModal, setShowCreateModal] = useState(false)
    /** 教材選択後に「追加」から開いた場合、その教材IDで固定（変更不可） */
    const [createModalBookLockedId, setCreateModalBookLockedId] = useState<string | null>(null)
    type CreateMode = 'ai' | 'flashcard'
    const [createMode, setCreateMode] = useState<CreateMode>('ai')
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [selectedSubjectKey, setSelectedSubjectKey] = useState<string | null>(null)

    // 履歴モーダル
    const [showHistoryModal, setShowHistoryModal] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyTab, setHistoryTab] = useState<'ai' | 'flashcard'>('ai')
    const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null)
    // フィルタータイプ: null=全件, 'incorrect'=不正解, 'fuzzy'=うろ覚え, 'both'=両方
    const [historyFilter, setHistoryFilter] = useState<'incorrect' | 'fuzzy' | 'both' | null>(null)
    const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<Record<string, boolean>>({})
    type QuizHistoryItem = {
        id: string
        created_at: string
        theme: string
        question: string
        choices: string[]
        correct_index: number
        selected_index: number
        is_correct: boolean
        subject: string
        reference_book_id: string | null
        explanation?: string | null
        rating?: 'perfect' | 'good' | 'hard' | null
        sm2_interval?: number | null
        sm2_ease_factor?: number | null
        sm2_repetitions?: number | null
    }
    type FlashcardHistoryItem = {
        id: string
        created_at: string
        subject: string
        content: string
        rating: 'perfect' | 'good' | 'hard'
        reference_book_id: string | null
        review_material_id: string | null
        sm2_interval?: number | null
        sm2_ease_factor?: number | null
        sm2_repetitions?: number | null
    }
    type ThemeQAHistoryItem = {
        id: string
        created_at: string
        subject: string
        theme: string
        question: string
        answer: string
        reference_book_id: string | null
        model: string | null
    }
    const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([])
    const [flashcardHistory, setFlashcardHistory] = useState<FlashcardHistoryItem[]>([])
    const [themeQaHistory, setThemeQaHistory] = useState<ThemeQAHistoryItem[]>([])

    // Book selection states
    const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
    const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
    const [showBookPicker, setShowBookPicker] = useState(false)
    const [showAddBookForm, setShowAddBookForm] = useState(false)
    const [newBookName, setNewBookName] = useState('')
    const [newBookImage, setNewBookImage] = useState<string | null>(null)
    const [editingBookId, setEditingBookId] = useState<string | null>(null)

    const [aiNotes, setAiNotes] = useState<string[]>([''])
    type FlashcardItem = { question: string; answer: string }
    const [flashcards, setFlashcards] = useState<FlashcardItem[]>([{ question: '', answer: '' }])
    type AskAIContext = {
        taskId: string
        reviewMaterialId: string | null
        subject: string
        theme: string
        quizQuestion: string
        explanation: string
        referenceBookId: string | null
    }
    const [showAskAIModal, setShowAskAIModal] = useState(false)
    const [askAIContext, setAskAIContext] = useState<AskAIContext | null>(null)
    const [askAIInput, setAskAIInput] = useState('')
    const [askAIAnswer, setAskAIAnswer] = useState('')
    const [askAILoading, setAskAILoading] = useState(false)

    const endpoint = useMemo(() => {
        const direct = process.env.EXPO_PUBLIC_QA_ENDPOINT
        const base = process.env.EXPO_PUBLIC_API_BASE_URL
        try {
            if (direct) {
                const u = new URL(direct)
                u.pathname = '/api/quiz'
                u.search = ''
                u.hash = ''
                return u.toString()
            }
        } catch {
            // fall through to base/env fallback
        }
        if (base) return `${base.replace(/\/$/, '')}/api/quiz`
        return ''
    }, [])

    const themeFromImageEndpoint = useMemo(() => {
        const directTheme = process.env.EXPO_PUBLIC_THEME_FROM_IMAGE_ENDPOINT
        if (directTheme) return directTheme
        const base = process.env.EXPO_PUBLIC_API_BASE_URL
        if (base) return `${base.replace(/\/$/, '')}/api/theme-from-image`
        if (!endpoint) return ''
        return endpoint.replace(/\/api\/quiz$/, '/api/theme-from-image')
    }, [endpoint])

    const themeQAEndpoint = useMemo(() => {
        const direct = process.env.EXPO_PUBLIC_THEME_QA_ENDPOINT
        if (direct) return direct
        const base = process.env.EXPO_PUBLIC_API_BASE_URL
        if (base) return `${base.replace(/\/$/, '')}/api/theme-qa`
        if (!endpoint) return ''
        return endpoint.replace(/\/api\/quiz$/, '/api/theme-qa')
    }, [endpoint])

    const [photoThemeLoading, setPhotoThemeLoading] = useState(false)
    // 範囲選択（切り取り）モーダル
    const [showCropModal, setShowCropModal] = useState(false)
    const [cropImageUri, setCropImageUri] = useState<string | null>(null)
    const [cropImageWidth, setCropImageWidth] = useState(0)
    const [cropImageHeight, setCropImageHeight] = useState(0)
    const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
    const [cropContainerLayout, setCropContainerLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
    const cropDragRef = useRef<{
        handle: CropHandle;
        start: CropRect;
        lastX: number;
        lastY: number;
        totalDx: number;
        totalDy: number;
        isPinch: boolean;
        pinchStartRect: CropRect;
        pinchStartDist: number;
        pinchStartMid: { x: number; y: number };
    }>({
        handle: null,
        start: { x: 0, y: 0, width: 1, height: 1 },
        lastX: 0, lastY: 0, totalDx: 0, totalDy: 0,
        isPinch: false,
        pinchStartRect: { x: 0, y: 0, width: 1, height: 1 },
        pinchStartDist: 0,
        pinchStartMid: { x: 0, y: 0 },
    })
    const cropRectRef = useRef<CropRect>(cropRect)
    const cropLayoutRef = useRef(cropContainerLayout)
    const cropImgSizeRef = useRef({ w: cropImageWidth, h: cropImageHeight })
    const contentModalKeyboardRef = useRef<any>(null)
    const createModalKeyboardRef = useRef<any>(null)
    cropRectRef.current = cropRect
    cropLayoutRef.current = cropContainerLayout
    cropImgSizeRef.current = { w: cropImageWidth, h: cropImageHeight }

    const retryKeyboardAwareUpdate = (ref: React.MutableRefObject<any>) => {
        ;[0, 120, 280, 520].forEach((delay) => {
            setTimeout(() => {
                ref.current?.update?.()
            }, delay)
        })
    }

    const getCropDisplayRect = (): { offsetX: number; offsetY: number; displayW: number; displayH: number } => {
        const { width: cw, height: ch } = cropLayoutRef.current
        const { w: iw, h: ih } = cropImgSizeRef.current
        if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) return { offsetX: 0, offsetY: 0, displayW: 0, displayH: 0 }
        const scale = Math.min(cw / iw, ch / ih)
        const displayW = iw * scale
        const displayH = ih * scale
        return {
            offsetX: (cw - displayW) / 2,
            offsetY: (ch - displayH) / 2,
            displayW,
            displayH,
        }
    }

    const clampCropRect = (r: CropRect): CropRect => {
        let { x, y, width, height } = r
        if (width < CROP_MIN_REL) width = CROP_MIN_REL
        if (height < CROP_MIN_REL) height = CROP_MIN_REL
        if (x < 0) { width += x; x = 0 }
        if (y < 0) { height += y; y = 0 }
        if (x + width > 1) width = 1 - x
        if (y + height > 1) height = 1 - y
        if (width < CROP_MIN_REL || height < CROP_MIN_REL) return cropRectRef.current
        return { x, y, width, height }
    }

    const applyCropDrag = (start: CropRect, handle: CropHandle, dXRel: number, dYRel: number): CropRect => {
        if (!handle || handle === 'center') {
            let x = start.x + dXRel
            let y = start.y + dYRel
            if (x < 0) x = 0
            if (y < 0) y = 0
            if (x + start.width > 1) x = 1 - start.width
            if (y + start.height > 1) y = 1 - start.height
            return { ...start, x, y }
        }
        let { x, y, width, height } = start
        if (handle === 'topLeft') {
            x += dXRel
            y += dYRel
            width -= dXRel
            height -= dYRel
        } else if (handle === 'topRight') {
            y += dYRel
            width += dXRel
            height -= dYRel
        } else if (handle === 'bottomLeft') {
            x += dXRel
            width -= dXRel
            height += dYRel
        } else if (handle === 'bottomRight') {
            width += dXRel
            height += dYRel
        } else if (handle === 'left') {
            x += dXRel
            width -= dXRel
        } else if (handle === 'right') {
            width += dXRel
        } else if (handle === 'top') {
            y += dYRel
            height -= dYRel
        } else if (handle === 'bottom') {
            height += dYRel
        }
        return clampCropRect({ x, y, width, height })
    }

    const hitTestCropHandle = (px: number, py: number): CropHandle => {
        const { offsetX, offsetY, displayW, displayH } = getCropDisplayRect()
        const r = cropRectRef.current
        const left = offsetX + r.x * displayW
        const top = offsetY + r.y * displayH
        const right = left + r.width * displayW
        const bottom = top + r.height * displayH
        const inLeft = px >= left - CROP_EDGE_HIT && px <= left + CROP_HANDLE_SIZE
        const inRight = px >= right - CROP_HANDLE_SIZE && px <= right + CROP_EDGE_HIT
        const inTop = py >= top - CROP_EDGE_HIT && py <= top + CROP_HANDLE_SIZE
        const inBottom = py >= bottom - CROP_HANDLE_SIZE && py <= bottom + CROP_EDGE_HIT
        if (inLeft && inTop) return 'topLeft'
        if (inRight && inTop) return 'topRight'
        if (inLeft && inBottom) return 'bottomLeft'
        if (inRight && inBottom) return 'bottomRight'
        if (inLeft && py >= top && py <= bottom) return 'left'
        if (inRight && py >= top && py <= bottom) return 'right'
        if (inTop && px >= left && px <= right) return 'top'
        if (inBottom && px >= left && px <= right) return 'bottom'
        if (px >= left && px <= right && py >= top && py <= bottom) return 'center'
        return null
    }

    const cropPanResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
            const touches = evt.nativeEvent.touches
            if (touches && touches.length >= 2) {
                const t0 = touches[0]
                const t1 = touches[1]
                const dist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY)
                const midX = (t0.pageX + t1.pageX) / 2
                const midY = (t0.pageY + t1.pageY) / 2
                cropDragRef.current = {
                    ...cropDragRef.current,
                    isPinch: true,
                    pinchStartRect: { ...cropRectRef.current },
                    pinchStartDist: dist,
                    pinchStartMid: { x: midX, y: midY },
                }
            } else {
                const { locationX, locationY } = evt.nativeEvent
                const handle = hitTestCropHandle(locationX, locationY)
                cropDragRef.current = {
                    ...cropDragRef.current,
                    handle,
                    isPinch: false,
                    start: { ...cropRectRef.current },
                    lastX: evt.nativeEvent.pageX,
                    lastY: evt.nativeEvent.pageY,
                    totalDx: 0,
                    totalDy: 0,
                }
            }
        },
        onPanResponderMove: (evt) => {
            const touches = evt.nativeEvent.touches
            const ref = cropDragRef.current
            const { displayW, displayH } = getCropDisplayRect()
            if (displayW <= 0 || displayH <= 0) return

            if (touches && touches.length >= 2) {
                // --- 2本指: ピンチで矩形を拡大縮小、中心ドラッグで移動 ---
                const t0 = touches[0]
                const t1 = touches[1]
                const dist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY)
                const midX = (t0.pageX + t1.pageX) / 2
                const midY = (t0.pageY + t1.pageY) / 2

                if (!ref.isPinch || ref.pinchStartDist <= 0) {
                    // 途中から2本指になった場合は基準を更新
                    cropDragRef.current.isPinch = true
                    cropDragRef.current.pinchStartRect = { ...cropRectRef.current }
                    cropDragRef.current.pinchStartDist = dist
                    cropDragRef.current.pinchStartMid = { x: midX, y: midY }
                    return
                }

                const scale = dist / ref.pinchStartDist
                const src = ref.pinchStartRect

                // 中心を保ちつつサイズをscale倍する
                const newW = Math.min(1, src.width * scale)
                const newH = Math.min(1, src.height * scale)

                // 移動量（ピンチ中心のドラッグ）
                const dxRel = (midX - ref.pinchStartMid.x) / displayW
                const dyRel = (midY - ref.pinchStartMid.y) / displayH

                let newX = src.x + (src.width - newW) / 2 + dxRel
                let newY = src.y + (src.height - newH) / 2 + dyRel

                setCropRect(clampCropRect({ x: newX, y: newY, width: newW, height: newH }))
            } else {
                // --- 1本指: 従来通りハンドル操作 ---
                if (ref.handle == null) return
                const pageX = evt.nativeEvent.pageX
                const pageY = evt.nativeEvent.pageY
                ref.totalDx += pageX - ref.lastX
                ref.totalDy += pageY - ref.lastY
                ref.lastX = pageX
                ref.lastY = pageY
                const dXRel = ref.totalDx / displayW
                const dYRel = ref.totalDy / displayH
                const next = applyCropDrag(ref.start, ref.handle, dXRel, dYRel)
                setCropRect(next)
            }
        },
        onPanResponderRelease: () => {
            cropDragRef.current.isPinch = false
        },
    }), [])

    const loadTasks = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('review_tasks')
            .select('id, due_at, status, study_log_id, review_material_id, study_logs(note, subject, started_at, reference_book_id), review_materials(content, subject, reference_book_id, created_at, study_date, sm2_interval, sm2_ease_factor, sm2_repetitions)')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true })

        if (!error) {
            const normalized = ((data as any[]) || []).map((task) => {
                const sl = Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null
                const rm = Array.isArray(task.review_materials) ? task.review_materials[0] ?? null : task.review_materials ?? null

                const effectiveLog = rm ? {
                    note: rm.content,
                    subject: rm.subject,
                    reference_book_id: rm.reference_book_id,
                    started_at: rm.study_date || rm.created_at
                } : sl

                return {
                    ...task,
                    study_logs: effectiveLog,
                    review_materials: rm,
                }
            })
            setReviewTasks(normalized as ReviewTask[])
        }

        // Load books here too so we have images immediately
        const { data: booksData, error: booksError } = await supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        if (!booksError) {
            setReferenceBooks((booksData || []) as ReferenceBook[])
        }

        setLoading(false)
    }

    const loadFutureTasks = async () => {
        const { data: tasksData, error: tasksError } = await supabase
            .from('review_tasks')
            .select('id, due_at, status, study_log_id, review_material_id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .gt('due_at', new Date().toISOString())
            .order('due_at', { ascending: true })

        if (tasksError) {
            setFutureTasks([])
            return
        }

        const tasks = (tasksData || []) as any[]
        if (tasks.length === 0) {
            setFutureTasks([])
            return
        }

        const studyLogIds = Array.from(new Set(tasks.map((t) => t.study_log_id).filter(Boolean)))
        const materialIds = Array.from(new Set(tasks.map((t) => t.review_material_id).filter(Boolean)))

        const studyLogMap = new Map<string, any>()
        if (studyLogIds.length > 0) {
            const { data: logsData } = await supabase
                .from('study_logs')
                .select('id, note, subject, started_at, reference_book_id')
                .in('id', studyLogIds as string[])
                ; (logsData || []).forEach((log: any) => {
                    studyLogMap.set(log.id, log)
                })
        }

        const materialMap = new Map<string, any>()
        if (materialIds.length > 0) {
            const { data: materialsData } = await supabase
                .from('review_materials')
                .select('id, content, subject, reference_book_id, created_at, study_date')
                .in('id', materialIds as string[])
                ; (materialsData || []).forEach((m: any) => {
                    materialMap.set(m.id, m)
                })
        }

        const normalized = tasks.map((task) => {
            const rm = task.review_material_id ? (materialMap.get(task.review_material_id) ?? null) : null
            const sl = task.study_log_id ? (studyLogMap.get(task.study_log_id) ?? null) : null
            const effectiveLog = rm ? {
                note: rm.content,
                subject: rm.subject,
                reference_book_id: rm.reference_book_id,
                started_at: rm.study_date || rm.created_at,
            } : sl
            return { ...task, study_logs: effectiveLog, review_materials: rm }
        })

        setFutureTasks(normalized)
    }

    const pickFirstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
        if (Array.isArray(value)) return value[0] ?? null
        return value ?? null
    }

    const formatHistoryDate = (dateString?: string | null) => {
        if (!dateString) return '—'
        const date = new Date(dateString)
        if (Number.isNaN(date.getTime())) return '—'
        return formatDateLabel(date)
    }

    const loadHistory = async () => {
        if (!userId) return
        setHistoryLoading(true)
        setHistoryErrorMessage(null)
        try {
            const quizList: QuizHistoryItem[] = []
            const flashList: FlashcardHistoryItem[] = []
            const themeQaList: ThemeQAHistoryItem[] = []
            const errors: string[] = []

            try {
                const { data: qaData, error: qaError } = await supabase
                    .from('quiz_attempts')
                    .select(`
                        id, question, choices, correct_index, selected_index, is_correct, created_at, explanation, rating, theme,
                        review_tasks ( review_material_id, study_log_id, review_materials ( subject, reference_book_id, content, sm2_interval, sm2_ease_factor, sm2_repetitions ), study_logs ( subject, reference_book_id, note ) )
                    `)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })

                if (qaError) {
                    errors.push('AIモード履歴の取得に失敗しました。')
                } else if (qaData) {
                    const rt = (qaData as any[]).map((row: any) => {
                        const t = pickFirstRelation(row.review_tasks)
                        const rm = pickFirstRelation(t?.review_materials)
                        const sl = pickFirstRelation(t?.study_logs)
                        const normalizedChoices = Array.isArray(row.choices)
                            ? row.choices.filter((choice: unknown) => typeof choice === 'string') as string[]
                            : []
                        const correct_index = Number.isInteger(row.correct_index) ? row.correct_index : -1
                        const selected_index = Number.isInteger(row.selected_index) ? row.selected_index : -1
                        const is_correct = !!row.is_correct
                        const explanation = typeof row.explanation === 'string' ? row.explanation : null
                        const rating = row.rating === 'perfect' || row.rating === 'good' || row.rating === 'hard' ? row.rating : null
                        const question = typeof row.question === 'string' ? row.question : '—'
                        const created_at = typeof row.created_at === 'string' ? row.created_at : ''

                        let theme = ''
                        if (typeof row.theme === 'string' && row.theme.trim() !== '') {
                            theme = row.theme
                        } else {
                            const themeRaw = (rm?.content ?? sl?.note ?? '')
                            theme = typeof themeRaw === 'string'
                                ? (themeRaw.trim().split('\n')[0] || '—')
                                : '—'
                        }

                        const subject = rm?.subject ?? sl?.subject ?? '—'
                        const reference_book_id = rm?.reference_book_id ?? sl?.reference_book_id ?? null
                        const sm2_interval = typeof rm?.sm2_interval === 'number' ? rm.sm2_interval : null
                        const sm2_ease_factor = typeof rm?.sm2_ease_factor === 'number' ? rm.sm2_ease_factor : null
                        const sm2_repetitions = typeof rm?.sm2_repetitions === 'number' ? rm.sm2_repetitions : null
                        return {
                            id: row.id,
                            created_at,
                            theme,
                            question,
                            choices: normalizedChoices,
                            correct_index,
                            selected_index,
                            is_correct,
                            subject,
                            reference_book_id,
                            explanation,
                            rating,
                            sm2_interval,
                            sm2_ease_factor,
                            sm2_repetitions,
                        }
                    })
                    quizList.push(...rt)
                }
            } catch {
                errors.push('AIモード履歴の取得に失敗しました。')
            }

            try {
                const { data: faData, error: faError } = await supabase
                    .from('flashcard_attempts')
                    .select('id, subject, content, rating, created_at, review_material_id, review_materials ( reference_book_id, sm2_interval, sm2_ease_factor, sm2_repetitions )')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(200)

                if (faError) {
                    errors.push('単語帳履歴の取得に失敗しました。')
                } else if (faData) {
                    flashList.push(...(faData as any[]).map((row: any) => {
                        const rm = pickFirstRelation(row.review_materials)
                        const rating = row.rating === 'perfect' || row.rating === 'good' || row.rating === 'hard'
                            ? row.rating
                            : 'good'
                        return {
                            id: row.id,
                            created_at: typeof row.created_at === 'string' ? row.created_at : '',
                            subject: typeof row.subject === 'string' ? row.subject : '—',
                            content: typeof row.content === 'string' ? row.content : '—',
                            rating,
                            reference_book_id: rm?.reference_book_id ?? null,
                            review_material_id: row.review_material_id || null,
                            sm2_interval: typeof rm?.sm2_interval === 'number' ? rm.sm2_interval : null,
                            sm2_ease_factor: typeof rm?.sm2_ease_factor === 'number' ? rm.sm2_ease_factor : null,
                            sm2_repetitions: typeof rm?.sm2_repetitions === 'number' ? rm.sm2_repetitions : null,
                        }
                    }))
                }
            } catch {
                errors.push('単語帳履歴の取得に失敗しました。')
            }

            try {
                const { data: themeQAData, error: themeQAError } = await supabase
                    .from('theme_qa_logs')
                    .select('id, created_at, subject, theme, question, answer, reference_book_id, model')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(300)

                if (themeQAError) {
                    errors.push('AI質問履歴の読み込みに失敗しました。')
                } else if (themeQAData) {
                    themeQaList.push(...(themeQAData as any[]).map((row: any) => ({
                        id: row.id,
                        created_at: typeof row.created_at === 'string' ? row.created_at : '',
                        subject: typeof row.subject === 'string' ? row.subject : '未分類',
                        theme: typeof row.theme === 'string' ? row.theme : '未分類',
                        question: typeof row.question === 'string' ? row.question : '',
                        answer: typeof row.answer === 'string' ? row.answer : '',
                        reference_book_id: typeof row.reference_book_id === 'string' ? row.reference_book_id : null,
                        model: typeof row.model === 'string' ? row.model : null,
                    })))
                }
            } catch {
                errors.push('AI質問履歴の読み込みに失敗しました。')
            }

            const bookFilter = selectedSubjectKey?.startsWith('book:') ? selectedSubjectKey.slice(5) : null
            const subjectFilter = selectedSubjectKey?.startsWith('subject:')
                ? selectedSubjectKey.replace(/^subject:/, '')
                : null

            const filterQuiz = (item: QuizHistoryItem) => {
                if (bookFilter) return item.reference_book_id === bookFilter
                if (subjectFilter) return item.subject === subjectFilter
                return true
            }
            const filterFlash = (item: FlashcardHistoryItem) => {
                if (bookFilter) return item.reference_book_id === bookFilter
                if (subjectFilter) return item.subject === subjectFilter
                return true
            }
            const filterThemeQA = (item: ThemeQAHistoryItem) => {
                if (bookFilter) return item.reference_book_id === bookFilter
                if (subjectFilter) return item.subject === subjectFilter
                return true
            }

            setQuizHistory(quizList.filter(filterQuiz))
            setFlashcardHistory(flashList.filter(filterFlash))
            setThemeQaHistory(themeQaList.filter(filterThemeQA))
            setHistoryErrorMessage(errors.length > 0 ? errors.join('\n') : null)
        } finally {
            setHistoryLoading(false)
        }
    }

    useEffect(() => {
        loadTasks()
        loadFutureTasks()
    }, [userId])

    useEffect(() => {
        if (!showHistoryModal) return
        loadHistory()
    }, [showHistoryModal, selectedSubjectKey, userId])

    // テーマの進捗（スキップ/完了）を端末に保存して、再ログイン後も維持する
    useEffect(() => {
        setSkippedThemes({})
        setCompletedThemesInTask({})
        if (!userId) return
        let active = true
            ; (async () => {
                try {
                    const raw = await AsyncStorage.getItem(getReviewProgressStorageKey(userId))
                    if (!active || !raw) return
                    const parsed = JSON.parse(raw) as Partial<PersistedReviewProgress>
                    if (parsed.skippedThemes && typeof parsed.skippedThemes === 'object') {
                        setSkippedThemes(parsed.skippedThemes)
                    }
                    if (parsed.completedThemesInTask && typeof parsed.completedThemesInTask === 'object') {
                        setCompletedThemesInTask(parsed.completedThemesInTask)
                    }
                } catch {
                    // ignore storage parse/read errors
                }
            })()
        return () => { active = false }
    }, [userId])

    // 進捗状態の永続化
    useEffect(() => {
        if (!userId) return
        const payload: PersistedReviewProgress = { skippedThemes, completedThemesInTask }
        AsyncStorage.setItem(getReviewProgressStorageKey(userId), JSON.stringify(payload)).catch(() => {
            // ignore storage write errors
        })
    }, [userId, skippedThemes, completedThemesInTask])

    // 既に存在しないタスクIDの進捗は自動で掃除する
    useEffect(() => {
        const validTaskIds = new Set(reviewTasks.map((t) => t.id))
        const pruneByTask = (prev: Record<string, string[]>) => {
            let changed = false
            const next: Record<string, string[]> = {}
            Object.entries(prev).forEach(([taskId, themes]) => {
                if (!validTaskIds.has(taskId)) {
                    changed = true
                    return
                }
                const normalized = Array.from(new Set((themes || []).filter(Boolean)))
                if (normalized.length === 0) {
                    changed = true
                    return
                }
                if (normalized.length !== (themes || []).length) {
                    changed = true
                }
                next[taskId] = normalized
            })
            return changed ? next : prev
        }
        setSkippedThemes(pruneByTask)
        setCompletedThemesInTask(pruneByTask)
    }, [reviewTasks])

    // 明日以降の復習予定モーダルを開いたときに最新を取得
    useEffect(() => {
        if (showFutureModal) {
            setFutureTasksLoading(true)
            loadFutureTasks().finally(() => setFutureTasksLoading(false))
        }
    }, [showFutureModal])

    const loadContentMaterials = async () => {
        const { data, error } = await supabase
            .from('review_materials')
            .select('*')
            .eq('user_id', userId)
            .order('study_date', { ascending: false })
            .order('created_at', { ascending: false })
        if (!error) {
            let list = (data || []) as (ReviewMaterial & { study_date?: string | null })[]
            if (selectedSubjectKey) {
                const bookMatch = selectedSubjectKey.startsWith('book:')
                const bookId = bookMatch ? selectedSubjectKey.slice(5) : null
                if (bookId) {
                    list = list.filter((m) => m.reference_book_id === bookId)
                } else {
                    const subject = selectedSubjectKey.startsWith('subject:') ? selectedSubjectKey.slice(8) : selectedSubjectKey
                    list = list.filter((m) => (m.subject || 'その他') === subject)
                }
            }
            setContentMaterials(list)
        }
    }

    useEffect(() => {
        if (showContentModal) loadContentMaterials()
    }, [showContentModal, selectedSubjectKey])

    const stripThemeBullet = (s: string) => (s || '').replace(/^[・•\-*]\s*/, '').trim()

    const saveContentThemeEdit = async () => {
        if (!editingContentTheme || editContentThemeText === undefined) return
        const { materialId, lineIndex } = editingContentTheme
        const material = contentMaterials.find((m) => m.id === materialId)
        if (!material) return
        let lines = (material.content || '').split('\n')
        if (lines.length === 0) lines = ['']
        if (lineIndex < 0 || lineIndex >= lines.length) return
        lines[lineIndex] = editContentThemeText.trim()
        const newContent = lines.join('\n')
        const { error } = await supabase.from('review_materials').update({ content: newContent }).eq('id', materialId)
        if (!error) {
            setContentMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, content: newContent } : m)))
            setEditingContentTheme(null)
            setEditContentThemeText('')
            loadTasks()
            loadFutureTasks()
        } else {
            Alert.alert('エラー', '保存に失敗しました')
        }
    }

    const deleteContentMaterial = (material: ReviewMaterial & { study_date?: string | null }) => {
        Alert.alert(
            '記録を削除',
            'この学習記録を削除しますか？明日以降の復習予定からも消えます。',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('review_materials').delete().eq('id', material.id)
                        if (error) {
                            Alert.alert('エラー', '削除に失敗しました')
                        } else {
                            setContentMaterials((prev) => prev.filter((m) => m.id !== material.id))
                            loadTasks()
                            loadFutureTasks()
                        }
                    },
                },
            ]
        )
    }

    const deleteContentTheme = (material: ReviewMaterial & { study_date?: string | null }, lineIndex: number) => {
        Alert.alert(
            'テーマを削除',
            'この問題（テーマ）を削除しますか？明日以降の復習予定からも消えます。',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: () => {
                        let lines = (material.content || '').split('\n')
                        if (lines.length === 0) lines = ['']
                        if (lineIndex < 0 || lineIndex >= lines.length) return
                        lines.splice(lineIndex, 1)
                        const newContent = lines.filter((l) => l.trim()).join('\n')
                        if (!newContent.trim()) {
                            supabase.from('review_materials').delete().eq('id', material.id).then(({ error }) => {
                                if (!error) {
                                    setContentMaterials((prev) => prev.filter((m) => m.id !== material.id))
                                    loadTasks()
                                    loadFutureTasks()
                                } else Alert.alert('エラー', '削除に失敗しました')
                            })
                            return
                        }
                        supabase.from('review_materials').update({ content: newContent }).eq('id', material.id).then(({ error }) => {
                            if (!error) {
                                setContentMaterials((prev) => prev.map((m) => (m.id === material.id ? { ...m, content: newContent } : m)))
                                loadTasks()
                                loadFutureTasks()
                            } else Alert.alert('エラー', '更新に失敗しました')
                        })
                    }
                }
            ]
        )
    }

    // Extracted loadBooks function for reusability
    const loadBooks = async () => {
        const { data, error } = await supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        if (!error) {
            setReferenceBooks((data || []) as ReferenceBook[])
        }
    }

    // Load reference books when modal opens
    useEffect(() => {
        if (showCreateModal) {
            loadBooks()
        }

    }, [showCreateModal, userId])

    const buildCroppedBase64ForThemeExtraction = async (
        imageUri: string,
        cropBox: { originX: number; originY: number; width: number; height: number }
    ): Promise<string> => {
        const maxSideSteps = [2000, 1600, 1280, 1080]
        const compressSteps = [0.72, 0.6, 0.5, 0.4]

        for (let i = 0; i < maxSideSteps.length; i += 1) {
            const maxSide = maxSideSteps[i]
            const compress = compressSteps[i] ?? 0.45
            const scale = Math.min(1, maxSide / Math.max(cropBox.width, cropBox.height))
            const resizeWidth = Math.max(1, Math.round(cropBox.width * scale))
            const resizeHeight = Math.max(1, Math.round(cropBox.height * scale))

            const actions: any[] = [{ crop: cropBox }]
            if (scale < 1) {
                actions.push({ resize: { width: resizeWidth, height: resizeHeight } })
            }

            const attempt = await imageManipulateAsync(imageUri, actions, {
                base64: true,
                format: ImageSaveFormat.JPEG,
                compress,
            })
            const base64 = attempt.base64
            if (base64 && base64.length <= MAX_IMAGE_BASE64_CHARS) {
                return base64
            }
        }
        throw new Error('画像サイズが大きすぎます。範囲を少し小さくして再度お試しください。')
    }

    const extractThemesFromImage = async (
        imageUri: string,
        cropBox: { originX: number; originY: number; width: number; height: number }
    ) => {
        if (!themeFromImageEndpoint) return
        setPhotoThemeLoading(true)
        try {
            const base64 = await buildCroppedBase64ForThemeExtraction(imageUri, cropBox)
            const res = await fetch(themeFromImageEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: base64,
                    mimeType: 'image/jpeg',
                }),
            })
            if (!res.ok) {
                const text = await res.text()
                let message = 'テーマの抽出に失敗しました'
                try {
                    const err = JSON.parse(text)
                    message = err.details || err.error || message
                } catch {
                    message = `${message} (HTTP ${res.status})`
                    if (text) message += `: ${text.slice(0, 120)}`
                }
                throw new Error(`${message}\nURL: ${themeFromImageEndpoint}`)
            }
            const data = await res.json()
            if (data.costDetails) {
                console.log('\n====================================')
                console.log('📸 [Theme Extraction] API Usage & Cost')
                console.log(`Model: gpt-4o-mini`)
                console.log(`Tokens: ${data.costDetails.totalTokens} (Input: ${data.costDetails.promptTokens}, Output: ${data.costDetails.completionTokens})`)
                console.log(`Cost (USD): $${data.costDetails.totalCostUSD.toFixed(5)}`)
                console.log(`Cost (JPY): 約 ${data.costDetails.totalCostJPY.toFixed(2)} 円`)
                console.log('====================================\n')
            }
            const themes: string[] = Array.isArray(data.themes) ? data.themes : []
            const slots = themes
                .slice(0, MAX_THEME_FROM_IMAGE)
                .map((t) => (typeof t === 'string' ? t.trim() : '').replace(/^[-*・]\s*/, ''))
                .filter(Boolean)
            setAiNotes((prev) => {
                const merged = prev.map((n) => n.trim()).filter(Boolean)
                const existing = new Set(merged)
                slots.forEach((slot) => {
                    if (!existing.has(slot)) {
                        merged.push(slot)
                        existing.add(slot)
                    }
                })
                return merged.length > 0 ? merged : ['']
            })
            setCreateMode('ai')
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'テーマの抽出に失敗しました'
            Alert.alert('エラー', msg)
        } finally {
            setPhotoThemeLoading(false)
        }
    }

    const getImageSize = (imageUri: string): Promise<{ width: number; height: number }> =>
        new Promise((resolve, reject) => {
            Image.getSize(
                imageUri,
                (width, height) => resolve({ width, height }),
                reject
            )
        })

    const handlePhotoToThemes = async (useCamera: boolean) => {
        if (!themeFromImageEndpoint) {
            Alert.alert('設定エラー', 'APIのURLが設定されていません。')
            return
        }
        const permission = useCamera
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== 'granted') {
            Alert.alert('権限が必要です', useCamera ? 'カメラの許可をしてください。' : '写真へのアクセスを許可してください。')
            return
        }
        const launch = useCamera
            ? () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
            : () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
        const result = await launch()
        const asset = result.assets?.[0]
        if (result.canceled || !asset?.uri) return

        const size = asset.width && asset.height
            ? { width: asset.width, height: asset.height }
            : await getImageSize(asset.uri).catch(() => ({ width: 0, height: 0 }))

        if (size.width <= 0 || size.height <= 0) {
            Alert.alert('エラー', '画像の読み込みに失敗しました。')
            return
        }

        setCropImageUri(asset.uri)
        setCropImageWidth(Math.round(size.width))
        setCropImageHeight(Math.round(size.height))
        setCropRect(INITIAL_CROP_RECT)
        setShowCropModal(true)
    }

    const submitCropAndExtractThemes = async () => {
        if (!cropImageUri || !themeFromImageEndpoint) return
        const { w: iw, h: ih } = cropImgSizeRef.current
        const originX = Math.round(cropRect.x * iw)
        const originY = Math.round(cropRect.y * ih)
        const width = Math.round(cropRect.width * iw)
        const height = Math.round(cropRect.height * ih)
        if (width <= 0 || height <= 0) {
            Alert.alert('エラー', '有効な範囲を選択してください。')
            return
        }
        setShowCropModal(false)
        setCropImageUri(null)
        await extractThemesFromImage(cropImageUri, {
            originX,
            originY,
            width,
            height,
        })
    }

    const pickBookImage = async (source: 'camera' | 'library') => {
        const permission = source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== 'granted') {
            Alert.alert(
                '権限が必要です',
                source === 'camera' ? 'カメラの許可をしてください。' : '写真へのアクセスを許可してください。'
            )
            return
        }
        const launch = source === 'camera'
            ? () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
            : () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
        const result = await launch()
        if (!result.canceled && result.assets?.[0]?.uri) {
            setNewBookImage(result.assets[0].uri)
        }
    }

    const openBookImageSourcePicker = () => {
        Alert.alert(
            '画像を設定',
            '取得方法を選んでください。',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: 'カメラで撮影',
                    onPress: () => {
                        void pickBookImage('camera')
                    },
                },
                {
                    text: 'ライブラリから選択',
                    onPress: () => {
                        void pickBookImage('library')
                    },
                },
            ]
        )
    }

    const handleAddBook = async () => {
        if (!newBookName.trim()) return
        let imageUrl: string | null = null

        // Only upload if newBookImage is a local URI (starts with file:// or content://)
        // If it's already a http URL, keep it as is unless replaced
        const isLocalImage = newBookImage && !newBookImage.startsWith('http')

        if (isLocalImage && newBookImage) {
            try {
                const response = await fetch(newBookImage)
                const arrayBuffer = await response.arrayBuffer()
                const filePath = `${userId}/${Date.now()}.jpg`
                const { error: uploadError } = await supabase.storage
                    .from('reference-books')
                    .upload(filePath, arrayBuffer, {
                        contentType: 'image/jpeg',
                        cacheControl: '3600',
                        upsert: false
                    })
                if (!uploadError) {
                    const { data } = supabase.storage.from('reference-books').getPublicUrl(filePath)
                    imageUrl = data.publicUrl
                }
            } catch (_error) {
                Alert.alert('画像のアップロードに失敗しました', '画像なしで保存します。')
            }
        } else if (newBookImage && newBookImage.startsWith('http')) {
            imageUrl = newBookImage
        }

        if (editingBookId) {
            // Update existing book
            const { error, data } = await supabase
                .from('reference_books')
                .update({
                    name: newBookName.trim(),
                    image_url: imageUrl,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingBookId)
                .select()
                .single()

            if (error) {
                Alert.alert('保存エラー', error.message)
                return
            }

            setReferenceBooks((prev) => prev.map(b => b.id === editingBookId ? (data as ReferenceBook) : b))
            setEditingBookId(null)
        } else {
            const { data: deletedBook } = await supabase
                .from('reference_books')
                .select('*')
                .eq('user_id', userId)
                .eq('name', newBookName.trim())
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (deletedBook) {
                const { error } = await supabase
                    .from('reference_books')
                    .update({
                        deleted_at: null,
                        image_url: imageUrl || deletedBook.image_url,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', deletedBook.id)
                if (error) {
                    Alert.alert('保存エラー', error.message)
                    return
                }
                const restored = {
                    ...(deletedBook as ReferenceBook),
                    deleted_at: null,
                    image_url: imageUrl || deletedBook.image_url,
                }
                setReferenceBooks((prev) => [restored, ...prev])
                setSelectedBookId(restored.id)
            } else {
                const { error, data } = await supabase
                    .from('reference_books')
                    .insert({
                        user_id: userId,
                        name: newBookName.trim(),
                        image_url: imageUrl,
                        type: 'book',
                    })
                    .select()
                    .single()
                if (error) {
                    Alert.alert('保存エラー', error.message)
                    return
                }
                setReferenceBooks((prev) => [data as ReferenceBook, ...prev])
                setSelectedBookId(data.id)
            }
        }
        setNewBookName('')
        setNewBookImage(null)
        setShowAddBookForm(false)
        await loadBooks() // Reload books to reflect the saved image
        // setShowBookPicker(false) // Keep open to verify or continue? Previously it closed. Let's keep it consistent with previous logic if it wasn't editing.
        // Actually, if editing, we probably want to stay in picker. If creating, maybe close?
        // Let's close unless we want to allow multiple edits. The user asked for ability to change logic.
        // For now, let's close it as the original code did, but maybe not if editing? 
        // Original code: setShowBookPicker(false)
        setShowBookPicker(false)
    }

    const handleDeleteBook = async (bookId: string) => {
        Alert.alert(
            '教材の削除',
            'この教材を削除してもよろしいですか？\n削除した教材は一覧から消えます。',
            [
                {
                    text: 'キャンセル',
                    style: 'cancel',
                },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase
                            .from('reference_books')
                            .update({ deleted_at: new Date().toISOString() })
                            .eq('id', bookId)
                        if (error) {
                            Alert.alert('削除エラー', error.message)
                            return
                        }
                        setReferenceBooks((prev) => prev.filter((book) => book.id !== bookId))
                        if (selectedBookId === bookId) setSelectedBookId(null)
                        if (editingBookId === bookId) {
                            setEditingBookId(null)
                            setShowAddBookForm(false)
                            setNewBookName('')
                            setNewBookImage(null)
                        }
                    },
                },
            ]
        )
    }

    const splitThemes = (text: string) => {
        return text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.replace(/^[-*•・]\s*/, '').trim())
            .filter(Boolean)
    }

    const getThemeKey = (taskId: string, theme: string) => `${taskId}::${theme}`

    const formatReviewDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const studyDay = getStudyDay(new Date(dateString))
        const studyDate = getStudyDayDate(studyDay)
        const today = getStudyDayDate(getStudyDay(new Date()))
        const diffDays = Math.max(0, Math.round((today.getTime() - studyDate.getTime()) / 86400000))
        return `${formatDateLabel(studyDate)}(${diffDays}日前)`
    }

    // 本来の期日（due_at）から何日遅れているかを返す（当日は0、遅れていない場合は0）
    const getOverdueDays = (dueAt?: string | null): number => {
        if (!dueAt) return 0
        const dueDay = getStudyDayDate(getStudyDay(new Date(dueAt)))
        const today = getStudyDayDate(getStudyDay(new Date()))
        return Math.max(0, Math.round((today.getTime() - dueDay.getTime()) / 86400000))
    }

    const parseFlashcard = (text: string): { question: string; answer: string | null } => {
        const parts = text.split(' : ')
        if (parts.length === 2) {
            return { question: parts[0].trim(), answer: parts[1].trim() }
        }
        return { question: text, answer: null }
    }

    const handleFlashcardReview = (taskId: string, theme: string) => {
        const key = getThemeKey(taskId, theme)
        setFlashcardMode((prev) => ({ ...prev, [key]: true }))
    }

    const handleShowAnswer = (taskId: string, theme: string) => {
        const key = getThemeKey(taskId, theme)
        setShowingAnswer((prev) => ({ ...prev, [key]: true }))
    }

    /**
     * SM-2: 1テーマずつ評価を記録。
     * 1テーマ1件のタスク（新仕様）の場合はその場で即スケジュール更新。
     * 複数テーマが1件に含まれる旧データの場合は、全テーマ完了時に一番厳しい評価で1回だけ更新（互換）。
     * @param source 'flashcard' = 単語帳で答えた → flashcard_attempts に記録する / 'quiz' = AIクイズで答えた → 記録しない
     */
    const handleSM2Rating = async (taskId: string, theme: string, rating: SM2Rating, source: 'flashcard' | 'quiz') => {
        const task = reviewTasks.find((t) => t.id === taskId)
        if (!task) return

        const noteContent = task.review_materials?.content || task.study_logs?.note || ''
        const allThemes = splitThemes(noteContent)
        const themes = allThemes.length > 0 ? allThemes : ['全体復習']

        // 1テーマ1件のタスクか（新仕様なら即時更新する）
        const isSingleTheme = themes.length <= 1

        // このテーマの評価を記録し、このテーマを「このタスク内で完了」に追加
        setThemeRatingsInTask((prev) => ({ ...prev, [getThemeKey(taskId, theme)]: rating }))
        setCompletedThemesInTask((prev) => ({
            ...prev,
            [taskId]: [...(prev[taskId] || []).filter((t) => t !== theme), theme],
        }))

        const completedNow = [...(completedThemesInTask[taskId] || []).filter((t) => t !== theme), theme]
        const allCompleted = themes.every((t) => completedNow.includes(t))

        // 単一テーマなら即時更新、複数テーマ（旧データ）なら全完了時のみ更新
        if (!isSingleTheme && !allCompleted) {
            return
        }

        const rm = task.review_materials as any
        const materialId = task.review_material_id
        const rawInterval = rm?.sm2_interval ?? 0
        const rawRepetitions = rm?.sm2_repetitions ?? 0
        const normalizedInterval = rawInterval === 0 && rawRepetitions === 0 ? 1 : rawInterval
        const normalizedRepetitions = rawInterval === 0 && rawRepetitions === 0 ? 1 : rawRepetitions
        const currentState = {
            interval: normalizedInterval,
            easeFactor: rm?.sm2_ease_factor ?? 2.5,
            repetitions: normalizedRepetitions,
        }

        const effectiveRating: SM2Rating = isSingleTheme
            ? rating
            : (() => {
                // 未評価テーマは現在のrating（最も厳しい評価）をデフォルトにする
                // ※ 'perfect' をデフォルトにすると「うろ覚え」→「完璧」に化けるバグが起きる
                const ratings = themes.map((t) => (t === theme ? rating : themeRatingsInTask[getThemeKey(taskId, t)] ?? rating))
                return ratings.some((r) => r === 'hard') ? 'hard' : ratings.some((r) => r === 'good') ? 'good' : 'perfect'
            })()

        const result = calculateSM2(effectiveRating, currentState)
        const nextDueDate = getNextDueDate(result.nextDueDays)

        const { error: updateError } = await supabase.from('review_tasks').update({ status: 'completed' }).eq('id', taskId)
        if (updateError) {
            setCompletedThemesInTask((prev) => ({
                ...prev,
                [taskId]: (prev[taskId] || []).filter((t) => t !== theme),
            }))
            setThemeRatingsInTask((prev) => {
                const next = { ...prev }
                delete next[getThemeKey(taskId, theme)]
                return next
            })
            Alert.alert('エラー', '復習の完了に失敗しました。もう一度お試しください。')
            return
        }
        if (materialId) {
            const { error: matError } = await supabase.from('review_materials').update({
                sm2_interval: result.interval,
                sm2_ease_factor: result.easeFactor,
                sm2_repetitions: result.repetitions,
            }).eq('id', materialId)
            if (matError) {
                // Log a warning but do NOT return — still proceed to schedule the next review task
                console.warn('[SM2] review_materials update failed:', matError.message)
            }
            await supabase.from('review_tasks')
                .delete()
                .eq('review_material_id', materialId)
                .eq('status', 'pending')
                .gt('due_at', new Date().toISOString())
            const { error: insertError } = await supabase.from('review_tasks').insert({
                user_id: userId,
                review_material_id: materialId,
                due_at: nextDueDate.toISOString(),
                status: 'pending',
            })
            if (insertError) {
                Alert.alert('エラー', '次回復習予定の登録に失敗しました。')
            }
        }

        if (source === 'flashcard') {
            await supabase.from('flashcard_attempts').insert({
                user_id: userId,
                review_material_id: materialId || null,
                subject: (task.review_materials as any)?.subject ?? (task.study_logs as any)?.subject ?? '',
                content: theme,
                rating: effectiveRating,
            }).then(({ error }) => { if (error) console.warn('flashcard_attempts insert skipped:', error.message) })
            // 履歴モーダルが開いている場合は即時リロードして最新データを反映
            if (showHistoryModal) loadHistory()
        } else if (source === 'quiz') {
            const quiz = quizByTask[taskId]
            const themeQuiz = quiz?.themes[theme]
            if (themeQuiz?.attemptIds && Object.keys(themeQuiz.attemptIds).length > 0) {
                const promises = Object.values(themeQuiz.attemptIds).map((attemptId) =>
                    supabase.from('quiz_attempts').update({ rating: effectiveRating }).eq('id', attemptId)
                )
                await Promise.all(promises).then((results) => {
                    results.forEach(({ error: err }) => { if (err) console.warn('quiz_attempts update skipped:', err.message) })
                })
            } else {
                await supabase
                    .from('quiz_attempts')
                    .update({ rating: effectiveRating })
                    .eq('review_task_id', taskId)
                    .is('rating', null)
                    .then(({ error: err }) => { if (err) console.warn('quiz_attempts rating update (by task) skipped:', err?.message) })
            }
        }

        setCompletedThemesInTask((prev) => { const next = { ...prev }; delete next[taskId]; return next })
        setThemeRatingsInTask((prev) => {
            const next = { ...prev }
            themes.forEach((t) => delete next[getThemeKey(taskId, t)])
            return next
        })
        setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
        loadFutureTasks()
    }





    // Note: handleQuizComplete is deprecated in favor of inline logic in the render block
    // which immediately shows SM2 rating buttons or a "continue" button without needing a "終了" step.

    const handleGenerateQuiz = async (task: ReviewTask, theme?: string): Promise<boolean> => {
        if (!endpoint) {
            Alert.alert('設定エラー', 'APIエンドポイントが設定されていません。アプリを再起動してみてください。')
            return false
        }
        const noteValue = (task.review_materials?.content || task.study_logs?.note || '').trim()
        if (!noteValue) {
            Alert.alert('データエラー', '学習内容（メモ）が記録されていないため、クイズを生成できません。')
            return false
        }
        const themeValue = theme || noteValue
        setQuizByTask((prev) => {
            const current = prev[task.id]?.themes || {}
            const existing = current[themeValue]
            return {
                ...prev,
                [task.id]: {
                    themes: {
                        ...current,
                        [themeValue]: {
                            loading: true,
                            questions: existing?.questions || [],
                            answers: existing?.answers || {},
                        },
                    },
                },
            }
        })
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 90000)
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: themeValue, count: 1 }),
                signal: controller.signal,
            })
            clearTimeout(timeoutId)
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const errorMessage = errorData.details || errorData.error || 'クイズの生成に失敗しました'
                throw new Error(errorMessage)
            }
            const data = await response.json()

            // Calculate and log usage if provided by the API
            if (data.usage) {
                console.log('--- OpenAI API Usage (quiz) ---')
                console.log(`Input Tokens:  ${data.usage.inputTokens} ($${data.usage.inputCostUSD.toFixed(6)})`)
                console.log(`Output Tokens: ${data.usage.outputTokens} ($${data.usage.outputCostUSD.toFixed(6)})`)
                console.log(`Total Tokens:  ${data.usage.totalTokens}`)
                console.log(`Total Cost:    $${data.usage.totalCostUSD.toFixed(6)} (約 ${data.usage.totalCostJPY.toFixed(4)} 円)`)
                console.log('---------------------------------------')
            }

            const questions = (data.questions || []).map((q: QuizQuestion) => {
                const originalChoices = q.choices ? q.choices.map((c: any) => String(c)) : []
                const correctIndex = Number(q.correct_index ?? 0)

                // Create an array of indices [0, 1, 2, 3] and shuffle them
                const indices = Array.from({ length: originalChoices.length }, (_, i) => i)
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]]
                }

                // Reorder choices based on shuffled indices
                const shuffledChoices = indices.map((i) => originalChoices[i])

                // Find where the original correct answer moved to
                const newCorrectIndex = indices.indexOf(correctIndex)

                return {
                    ...q,
                    choices: shuffledChoices,
                    correct_index: newCorrectIndex,
                    theme: themeValue,
                }
            })
            setQuizByTask((prev) => {
                const current = prev[task.id]?.themes || {}
                const existing = current[themeValue]
                return {
                    ...prev,
                    [task.id]: {
                        themes: {
                            ...current,
                            [themeValue]: {
                                loading: false,
                                questions,
                                answers: existing?.answers || {},
                            },
                        },
                    },
                }
            })
            return true
        } catch (error) {
            clearTimeout(timeoutId)
            setQuizByTask((prev) => {
                const next = { ...prev }
                const current = next[task.id]?.themes
                if (current?.[themeValue]) {
                    next[task.id] = {
                        themes: {
                            ...current,
                            [themeValue]: { ...current[themeValue], loading: false },
                        },
                    }
                } else {
                    delete next[task.id]
                }
                return next
            })
            const message = error instanceof Error ? error.message : 'クイズの生成に失敗しました。'
            if ((error as Error)?.name === 'AbortError') {
                Alert.alert('タイムアウト', 'クイズ生成が90秒でタイムアウトしました。通信環境を確認して再試行してください。')
            } else {
                Alert.alert('生成エラー', message)
            }
            return false
        }
    }


    const openAskAIModalFromExplanation = (task: ReviewTask, theme: string, question: QuizQuestion) => {
        const subject = task.study_logs?.subject?.trim() || '未分類'
        setAskAIContext({
            taskId: task.id,
            reviewMaterialId: task.review_material_id || null,
            subject,
            theme,
            quizQuestion: question.question || '',
            explanation: question.explanation || '',
            referenceBookId: task.study_logs?.reference_book_id || null,
        })
        setAskAIInput('')
        setAskAIAnswer('')
        setShowAskAIModal(true)
    }

    const closeAskAIModal = () => {
        if (askAILoading) return
        setShowAskAIModal(false)
        setAskAIContext(null)
        setAskAIInput('')
        setAskAIAnswer('')
    }

    const handleSubmitAskAI = async () => {
        const input = askAIInput.trim()
        if (!askAIContext) {
            Alert.alert('エラー', '質問対象が見つかりません。')
            return
        }
        if (!input) {
            Alert.alert('入力してください', 'AIに質問する内容を入力してください。')
            return
        }
        if (!themeQAEndpoint) {
            Alert.alert('設定エラー', 'AI質問用のAPIエンドポイントが未設定です。')
            return
        }

        setAskAILoading(true)
        try {
            const response = await fetch(themeQAEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: askAIContext.subject,
                    theme: askAIContext.theme,
                    quizQuestion: askAIContext.quizQuestion,
                    explanation: askAIContext.explanation,
                    question: input,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const message = errorData.details || errorData.error || 'AIへの質問に失敗しました。'
                throw new Error(message)
            }

            const data = await response.json()

            if (data.usage) {
                console.log('--- OpenAI API Usage (theme-qa) ---')
                console.log(`Input Tokens:  ${data.usage.inputTokens} ($${data.usage.inputCostUSD.toFixed(6)})`)
                console.log(`Output Tokens: ${data.usage.outputTokens} ($${data.usage.outputCostUSD.toFixed(6)})`)
                console.log(`Total Tokens:  ${data.usage.totalTokens}`)
                console.log(`Total Cost:    $${data.usage.totalCostUSD.toFixed(6)} (約 ${data.usage.totalCostJPY.toFixed(4)} 円)`)
                console.log('---------------------------------------')
            }

            const answerText = typeof data?.answer === 'string' ? data.answer.trim() : ''
            if (!answerText) {
                throw new Error('AIの回答が空でした。')
            }

            setAskAIAnswer(answerText)

            const { data: inserted, error: insertError } = await supabase
                .from('theme_qa_logs')
                .insert({
                    user_id: userId,
                    review_task_id: askAIContext.taskId,
                    review_material_id: askAIContext.reviewMaterialId,
                    reference_book_id: askAIContext.referenceBookId,
                    subject: askAIContext.subject,
                    theme: askAIContext.theme,
                    question: input,
                    answer: answerText,
                    model: 'gpt-5-mini',
                })
                .select('id, created_at, subject, theme, question, answer, reference_book_id, model')
                .single()

            if (insertError) {
                console.warn('theme_qa_logs insert failed:', insertError.message)
            } else if (inserted) {
                setThemeQaHistory((prev) => [inserted as ThemeQAHistoryItem, ...prev])
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'AIへの質問に失敗しました。'
            Alert.alert('エラー', message)
        } finally {
            setAskAILoading(false)
        }
    }


    const handleAnswer = async (taskId: string, theme: string, qIndex: number, choiceIndex: number) => {
        const quiz = quizByTask[taskId]
        const themeQuiz = quiz?.themes[theme]
        if (!themeQuiz || themeQuiz.loading) return
        if (themeQuiz.answers[qIndex] !== undefined) return

        const question = themeQuiz.questions[qIndex]
        if (!question) return

        // choiceIndex === -1 は「わからない」ボタン → 必ず不正解扱い
        const isCorrect = choiceIndex !== -1 && choiceIndex === question.correct_index
        const doInsert = () => supabase.from('quiz_attempts').insert({
            user_id: userId,
            review_task_id: taskId,
            question: question.question,
            choices: question.choices,
            correct_index: question.correct_index,
            selected_index: choiceIndex,
            is_correct: isCorrect,
            explanation: question.explanation || null,
            theme: theme,
        }).select('id').single()

        const { data, error } = await doInsert()
        if (error) {
            const { data: retryData, error: retryError } = await doInsert()
            if (retryError) {
                Alert.alert('記録に失敗しました', '解答を記録できませんでした。もう一度選択してください。')
                return
            }
            if (retryData?.id) {
                const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
                const nextAttemptIds = { ...(themeQuiz.attemptIds || {}), [qIndex]: retryData.id }
                const nextThemes = { ...(quiz?.themes || {}), [theme]: { ...themeQuiz, answers: nextAnswers, attemptIds: nextAttemptIds } }
                setQuizByTask((prev) => ({ ...prev, [taskId]: { themes: nextThemes } }))
            } else {
                const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
                const nextThemes = { ...(quiz?.themes || {}), [theme]: { ...themeQuiz, answers: nextAnswers } }
                setQuizByTask((prev) => ({ ...prev, [taskId]: { themes: nextThemes } }))
            }
            return
        }

        const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
        const nextAttemptIds = data?.id != null ? { ...(themeQuiz.attemptIds || {}), [qIndex]: data.id } : (themeQuiz.attemptIds || {})
        const nextThemes = { ...(quiz?.themes || {}), [theme]: { ...themeQuiz, answers: nextAnswers, attemptIds: nextAttemptIds } }
        setQuizByTask((prev) => ({ ...prev, [taskId]: { themes: nextThemes } }))
    }

    const handleSkipTask = async (taskId: string) => {
        await supabase.from('review_tasks').update({ status: 'skipped' }).eq('id', taskId)
        setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
    }

    const handleSkipTheme = (taskId: string, theme: string, remaining: string[]) => {
        setSkippedThemes((prev) => {
            const current = prev[taskId] || []
            if (current.includes(theme)) return prev
            return { ...prev, [taskId]: [...current, theme] }
        })
        setQuizByTask((prev) => {
            const current = prev[taskId]
            if (!current) return prev
            const nextThemes = { ...current.themes }
            delete nextThemes[theme]
            return { ...prev, [taskId]: { themes: nextThemes } }
        })
        const nextRemaining = remaining.filter((t) => t !== theme)
        if (nextRemaining.length === 0) handleSkipTask(taskId)
    }

    const handleEditTheme = async (task: ReviewTask, oldTheme: string, newTheme: string) => {
        const trimmed = newTheme.trim()
        if (!trimmed) return
        setEditingThemeKey(null)
        setEditingThemeText('')

        const materialId = task.review_material_id
        if (materialId) {
            // 現在のcontentの中で该当テーマ行を新テーマに置き換える
            const currentContent = task.review_materials?.content || task.study_logs?.note || ''
            const lines = currentContent.split('\n').map((line: string) => {
                const cleaned = line.trim().replace(/^[-*•・]\s*/, '').trim()
                if (cleaned === oldTheme.trim()) {
                    // 元の行頭文字を保持しながら置き換える
                    const prefix = line.match(/^(\s*[-*•・]\s*)/)?.[1] || '・'
                    return `${prefix}${trimmed}`
                }
                return line
            })
            const newContent = lines.join('\n')

            const { error } = await supabase
                .from('review_materials')
                .update({ content: newContent })
                .eq('id', materialId)
            if (error) {
                Alert.alert('保存エラー', error.message)
                return
            }
            // ローカルのreviewTasksも更新する
            setReviewTasks((prev) =>
                prev.map((t) => {
                    if (t.id !== task.id) return t
                    return {
                        ...t,
                        study_logs: { ...t.study_logs, note: newContent } as ReviewTask['study_logs'],
                        review_materials: t.review_materials ? { ...t.review_materials, content: newContent } : t.review_materials,
                    }
                }) as ReviewTask[]
            )
        }

        // 旧テーマのクイズステートを削除して再生成
        const fakeTask = {
            ...task,
            study_logs: task.study_logs ? { ...task.study_logs, note: task.review_materials?.content || task.study_logs?.note || '' } : task.study_logs,
            review_materials: task.review_materials ? {
                ...task.review_materials, content: (task.review_materials?.content || '').split('\n').map((line: string) => {
                    const cleaned = line.trim().replace(/^[-*•・]\s*/, '').trim()
                    if (cleaned === oldTheme.trim()) {
                        const prefix = line.match(/^(\s*[-*•・]\s*)/)?.[1] || '・'
                        return `${prefix}${trimmed}`
                    }
                    return line
                }).join('\n')
            } : task.review_materials,
        }

        setQuizByTask((prev) => {
            const current = prev[task.id]
            if (!current) return prev
            const nextThemes = { ...current.themes }
            delete nextThemes[oldTheme]
            return { ...prev, [task.id]: { themes: nextThemes } }
        })

        await handleGenerateQuiz(fakeTask, trimmed)
    }

    const handleGenerateFiveQuizzes = async () => {
        if (isGeneratingBulk) return
        if (!selectedSubjectKey) {
            Alert.alert('AIクイズ', '復習カードを選択してください。')
            return
        }

        setIsGeneratingBulk(true)
        try {
            const queue: { task: ReviewTask; theme: string }[] = []
            currentTasks.forEach((task) => {
                let themes = splitThemes(task.study_logs?.note || '')
                if (themes.length === 0) themes = [task.study_logs?.note?.trim() || '']
                themes.forEach((theme) => {
                    const trimmed = theme.trim()
                    if (!trimmed) return
                    if (queue.length >= 5) return
                    const themeKey = getThemeKey(task.id, trimmed)
                    const existingQuiz = quizByTask[task.id]?.themes?.[trimmed]
                    const isFlashcard = flashcardMode[themeKey]
                    if (!existingQuiz && !isFlashcard) {
                        queue.push({ task, theme: trimmed })
                    }
                })
            })

            if (queue.length === 0) {
                Alert.alert('AIクイズ', '新しく作成できるテーマがありません。')
                return
            }

            for (const item of queue) {
                await handleGenerateQuiz(item.task, item.theme)
            }
            Alert.alert('AIクイズ', `${queue.length}件のテーマでクイズを作成しました。`)
        } catch (error) {
            console.error('handleGenerateFiveQuizzes error', error)
            Alert.alert('エラー', 'AIクイズの一括作成に失敗しました。通信環境をご確認ください。')
        } finally {
            setIsGeneratingBulk(false)
        }
    }

    const handleCreate = async () => {
        const effectiveBookId = createModalBookLockedId ?? selectedBookId
        if (!effectiveBookId) {
            Alert.alert('エラー', '教材を選択してください')
            return
        }

        const selectedBook = referenceBooks.find((b) => b.id === effectiveBookId)
        const subject = selectedBook ? selectedBook.name : 'その他'

        // AIメモ（有効なもの）
        const validNotes = aiNotes.filter((n) => n.trim())
        const aiPart = validNotes.map((n) => `・${n.trim()}`).join('\n')

        // 単語帳カード（有効なもの）
        const validCards = flashcards.filter((c) => c.question.trim() && c.answer.trim())
        const flashcardPart = validCards.map((c) => `${c.question.trim()} : ${c.answer.trim()}`).join('\n')

        // 両方なければエラー
        if (!aiPart && !flashcardPart) {
            Alert.alert('エラー', 'AIメモか単語帳カードを最低1つ入力してください')
            return
        }

        // 両方あれば結合（AIメモ → 単語帳の順）
        const noteValue = [aiPart, flashcardPart].filter(Boolean).join('\n')

        // 1テーマ1件で保存するためテーマごとに分割（既存データ互換のためスキーマ変更なし）
        const themeLines = noteValue
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.replace(/^[-*•・]\s*/, '').trim())
            .filter(Boolean)
        const themes = themeLines.length > 0 ? themeLines : [noteValue.trim() || '全体復習']

        setLoading(true)

        // Use app's date logic
        const year = selectedDate.getFullYear()
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
        const day = String(selectedDate.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        const studyDayDate = getStudyDayDate(dateStr)
        const startedAtIso = new Date(studyDayDate.getTime() + 9 * 60 * 60 * 1000).toISOString()
        const firstDueDate = new Date(studyDayDate.getTime() + 24 * 60 * 60 * 1000)

        for (const themeContent of themes) {
            const { data, error } = await supabase
                .from('review_materials')
                .insert({
                    user_id: userId,
                    subject: subject,
                    content: themeContent,
                    reference_book_id: effectiveBookId || null,
                    study_date: startedAtIso,
                    sm2_interval: 1,
                    sm2_ease_factor: 2.5,
                    sm2_repetitions: 1,
                })
                .select()
                .single()

            if (error) {
                Alert.alert('保存エラー', error.message)
                setLoading(false)
                return
            }

            if (data?.id) {
                const { error: taskError } = await supabase.from('review_tasks').insert({
                    user_id: userId,
                    review_material_id: data.id,
                    due_at: firstDueDate.toISOString(),
                    status: 'pending',
                })
                if (taskError) {
                    console.error(taskError)
                    Alert.alert('タスク作成エラー', 'タスク作成に失敗しました')
                    setLoading(false)
                    return
                }
            }
        }


        setSelectedDate(new Date())
        setAiNotes([''])
        setFlashcards([{ question: '', answer: '' }])
        setShowCreateModal(false)
        setCreateModalBookLockedId(null)
        setCreateMode('ai')
        loadTasks()
        loadFutureTasks()
    }

    // DEBUG: Log tasks and groups
    useEffect(() => {
        if (reviewTasks.length > 0) {
            // console.log(`[ReviewScreen] Loaded ${reviewTasks.length} tasks`)
            reviewTasks.forEach(t => {
                const noteLen = t.study_logs?.note?.length || 0
                const bookId = t.study_logs?.reference_book_id
                // console.log(`- Task ${t.id}: Book=${bookId}, NoteLen=${noteLen}`)
            })
        }
    }, [reviewTasks])

    const groupedTasks = useMemo(() => {
        const groups: Record<string, {
            key: string
            title: string
            imageUrl: string | null
            tasks: ReviewTask[]
            themeCount: number
        }> = {}

        // 1. Initialize with all reference books
        referenceBooks.forEach((book) => {
            const key = `book:${book.id}`
            groups[key] = {
                key,
                title: book.name,
                imageUrl: book.image_url,
                tasks: [],
                themeCount: 0,
            }
        })

        // 2. Distribute tasks
        reviewTasks.forEach((task) => {
            const bookId = task.study_logs?.reference_book_id
            const subject = task.study_logs?.subject || 'その他'
            // If bookId exists, group by bookId. Otherwise group by subject name.
            const key = bookId ? `book:${bookId}` : `subject:${subject}`

            if (!groups[key]) {
                let title = subject
                let imageUrl: string | null = null

                if (bookId) {
                    const book = referenceBooks.find((b) => b.id === bookId)
                    if (book) {
                        title = book.name
                        imageUrl = book.image_url
                    }
                }

                groups[key] = {
                    key,
                    title,
                    imageUrl,
                    tasks: [],
                    themeCount: 0,
                }
            }
            groups[key].tasks.push(task)

            // Calculate theme count for this task
            let themes = splitThemes(task.study_logs?.note || '')
            if (themes.length === 0) {
                themes = ['全体復習']
            }
            // Exclude already skipped themes
            const visibleThemes = themes.filter((theme) => !(skippedThemes[task.id] || []).includes(theme) && !(completedThemesInTask[task.id] || []).includes(theme))
            groups[key].themeCount += visibleThemes.length
        })

        return Object.values(groups).sort((a, b) => {
            // Sort by task count desc, then title
            // if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length
            return a.title.localeCompare(b.title)
        })
    }, [reviewTasks, referenceBooks, skippedThemes, completedThemesInTask])

    // DEBUG: Log groups
    useEffect(() => {
        if (groupedTasks.length > 0) {
            // console.log(`[ReviewScreen] Grouped into ${groupedTasks.length} groups`)
            groupedTasks.forEach(g => {
                // console.log(`- Group ${g.key}: ${g.title}, ${g.tasks.length} tasks`)
            })
        }
    }, [groupedTasks])

    const currentTasks = useMemo(() => {
        if (!selectedSubjectKey) return []
        const group = groupedTasks.find(g => g.key === selectedSubjectKey)
        return group ? group.tasks : []
    }, [selectedSubjectKey, groupedTasks])


    // 同じ (subject, theme) は一番直近の復習日だけ表示する
    const groupedFutureTasks = useMemo(() => {
        const todayStudyDay = getStudyDay(new Date())
        const todayDate = getStudyDayDate(todayStudyDay)
        const themeToNearest: Record<string, { subject: string; theme: string; startedAt: string | null; dueAt: string; dueStudyDay: string; dateLabel: string; relativeLabel: string }> = {}

        futureTasks.forEach((task) => {
            if (selectedSubjectKey) {
                const bookId = task.study_logs?.reference_book_id
                const subject = task.study_logs?.subject || 'その他'
                const taskKey = bookId ? `book:${bookId}` : `subject:${subject}`
                if (taskKey !== selectedSubjectKey) return
            }

            const subject = task.study_logs?.subject || 'その他'
            let themes = splitThemes(task.study_logs?.note || '')
            if (themes.length === 0) themes = ['全体復習']
            const dueAt = task.due_at
            const dueStudyDay = getStudyDay(new Date(dueAt))
            const dueDate = getStudyDayDate(dueStudyDay)
            const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / 86400000)
            const relativeLabel = diffDays === 1 ? '明日' : diffDays === 2 ? '明後日' : `${diffDays}日後`
            const dateLabel = formatDateLabel(dueDate)
            const startedAt = task.study_logs?.started_at ?? null

            themes.forEach((theme) => {
                const key = `${subject}\n${theme}`
                const existing = themeToNearest[key]
                if (!existing || dueAt < existing.dueAt) {
                    themeToNearest[key] = { subject, theme, startedAt, dueAt, dueStudyDay, dateLabel, relativeLabel }
                }
            })
        })

        const groups: Record<string, { date: string; dateLabel: string; relativeLabel: string; themes: { subject: string; theme: string; startedAt: string | null }[] }> = {}
        Object.values(themeToNearest).forEach(({ subject, theme, startedAt, dueStudyDay, dateLabel, relativeLabel }) => {
            if (!groups[dueStudyDay]) {
                groups[dueStudyDay] = {
                    date: dueStudyDay,
                    dateLabel,
                    relativeLabel,
                    themes: [],
                }
            }
            groups[dueStudyDay].themes.push({ subject, theme, startedAt })
        })
        return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date))
    }, [futureTasks, selectedSubjectKey])

    const groupedQuizHistory = useMemo(() => {
        type TrendAttempt = {
            id: string
            created_at: string
            is_correct: boolean
            rating: 'perfect' | 'good' | 'hard' | null
            question: string
            explanation: string | null
            choices: string[]
            selected_index: number
            correct_index: number
        }
        type TrendQA = {
            id: string
            created_at: string
            question: string
            answer: string
            model: string | null
        }
        type TrendGroup = {
            key: string
            subject: string
            theme: string
            latestCreatedAt: string
            attempts: TrendAttempt[]
            qaLogs: TrendQA[]
            sm2_interval: number | null
            sm2_ease_factor: number | null
            sm2_repetitions: number | null
        }

        const toMillis = (dateString: string) => {
            const time = new Date(dateString).getTime()
            return Number.isNaN(time) ? 0 : time
        }

        const groups: Record<string, TrendGroup> = {}
        quizHistory.forEach((item) => {
            const subject = (item.subject || '—').trim() || '—'
            const theme = (item.theme || item.question || '未分類').trim() || '未分類'
            const key = `${subject}\n${theme}`
            if (!groups[key]) {
                groups[key] = {
                    key,
                    subject,
                    theme,
                    latestCreatedAt: item.created_at,
                    attempts: [],
                    qaLogs: [],
                    sm2_interval: item.sm2_interval ?? null,
                    sm2_ease_factor: item.sm2_ease_factor ?? null,
                    sm2_repetitions: item.sm2_repetitions ?? null,
                }
            }

            const current = groups[key]
            if (toMillis(item.created_at) > toMillis(current.latestCreatedAt)) {
                current.latestCreatedAt = item.created_at
            }
            if (current.sm2_interval == null && item.sm2_interval != null) current.sm2_interval = item.sm2_interval
            if (current.sm2_ease_factor == null && item.sm2_ease_factor != null) current.sm2_ease_factor = item.sm2_ease_factor
            if (current.sm2_repetitions == null && item.sm2_repetitions != null) current.sm2_repetitions = item.sm2_repetitions

            current.attempts.push({
                id: item.id,
                created_at: item.created_at,
                is_correct: item.is_correct,
                rating: item.rating ?? null,
                question: item.question,
                explanation: item.explanation ?? null,
                choices: item.choices ?? [],
                selected_index: item.selected_index,
                correct_index: item.correct_index,
            })
        })

        themeQaHistory.forEach((item) => {
            const subject = (item.subject || '未分類').trim() || '未分類'
            const theme = (item.theme || '未分類').trim() || '未分類'
            const key = `${subject}\n${theme}`

            if (!groups[key]) {
                groups[key] = {
                    key,
                    subject,
                    theme,
                    latestCreatedAt: item.created_at,
                    attempts: [],
                    qaLogs: [],
                    sm2_interval: null,
                    sm2_ease_factor: null,
                    sm2_repetitions: null,
                }
            }

            const current = groups[key]
            if (toMillis(item.created_at) > toMillis(current.latestCreatedAt)) {
                current.latestCreatedAt = item.created_at
            }
            current.qaLogs.push({
                id: item.id,
                created_at: item.created_at,
                question: item.question,
                answer: item.answer,
                model: item.model ?? null,
            })
        })

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

        return Object.values(groups)
            .map((group) => {
                const attempts = [...group.attempts].sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))
                const latestAttempt = attempts[attempts.length - 1] ?? null
                const qaLogs = [...group.qaLogs].sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))
                const latestQaLog = qaLogs[qaLogs.length - 1] ?? null
                const correctCount = attempts.filter((a) => a.is_correct).length
                const recentCorrectRatio = attempts.length > 0 ? correctCount / attempts.length : 0

                // ── 定数（後から調整しやすいよう分離）──
                const INTERVAL_MAX = 90       // intervalの正規化上限（日数）
                const EASE_MIN = 1.3
                const EASE_MAX = 2.8
                const REP_MAX = 8             // repetitionsの正規化上限
                const W_INTERVAL = 0.5        // 重み: interval
                const W_EASE = 0.2            // 重み: ease factor
                const W_REP = 0.3             // 重み: repetitions
                const DECAY_K = Math.LN2      // 忘却速度定数 (ln2 ≈ 0.693 → 期日に50%)

                // ── Step1: 到達上限（Mastery Ceiling）──
                const sm2Interval = group.sm2_interval ?? 0
                const sm2Ease = group.sm2_ease_factor ?? EASE_MIN
                const sm2Reps = group.sm2_repetitions ?? 0

                let masteryCeiling: number
                if (sm2Reps === 0) {
                    // 未学習 or 不正解リセット直後
                    masteryCeiling = 0.05
                } else {
                    const intervalNorm = clamp(Math.log(1 + sm2Interval) / Math.log(1 + INTERVAL_MAX), 0, 1)
                    const easeNorm = clamp((sm2Ease - EASE_MIN) / (EASE_MAX - EASE_MIN), 0, 1)
                    const repNorm = clamp(sm2Reps / REP_MAX, 0, 1)
                    masteryCeiling = intervalNorm * W_INTERVAL + easeNorm * W_EASE + repNorm * W_REP
                }

                // ── Step2: 時間減衰（Time Decay）──
                const intervalDays = Math.max(sm2Interval, 1)
                const elapsedMs = latestAttempt ? Date.now() - toMillis(latestAttempt.created_at) : 0
                const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)
                const decayRatio = elapsedDays / intervalDays
                const timeDecay = Math.exp(-DECAY_K * decayRatio)

                // ── Step3: 直近回答ペナルティ──
                const latestRating = latestAttempt?.rating ?? null
                const latestIsCorrect = latestAttempt?.is_correct ?? null
                let recentPenalty: number
                if (latestIsCorrect === false || latestRating === 'hard') {
                    recentPenalty = 0.1  // 不正解・苦手: 上限を10%に制限
                } else if (latestRating === 'good') {
                    recentPenalty = 0.8  // うろ覚え: 上限80%
                } else {
                    recentPenalty = 1.0  // 完璧: ペナルティなし
                }

                // ── 最終スコア ──
                const retentionScore = clamp(Math.round(masteryCeiling * timeDecay * recentPenalty * 100), 0, 100)

                const retentionLabel = retentionScore >= 75 ? '高' : retentionScore >= 45 ? '中' : '低'
                const retentionColor = retentionScore >= 75 ? '#16a34a' : retentionScore >= 45 ? '#d97706' : '#dc2626'

                return {
                    ...group,
                    attempts,
                    latestAttempt,
                    qaLogs,
                    latestQaLog,
                    retentionScore,
                    retentionLabel,
                    retentionColor,
                    recentCorrectRatio,
                }
            })
            .sort((a, b) => toMillis(b.latestCreatedAt) - toMillis(a.latestCreatedAt))
    }, [quizHistory, themeQaHistory])

    const groupedFlashcardHistory = useMemo(() => {
        type FlashcardTrendAttempt = {
            id: string
            created_at: string
            rating: 'perfect' | 'good' | 'hard'
        }
        type FlashcardTrendGroup = {
            key: string
            subject: string
            theme: string
            content: string
            latestCreatedAt: string
            attempts: FlashcardTrendAttempt[]
            sm2_interval: number | null
            sm2_ease_factor: number | null
            sm2_repetitions: number | null
        }

        const toMillis = (dateString: string) => {
            const time = new Date(dateString).getTime()
            return Number.isNaN(time) ? 0 : time
        }

        const groups: Record<string, FlashcardTrendGroup> = {}
        flashcardHistory.forEach((item) => {
            const subject = (item.subject || '—').trim() || '—'
            const parsed = parseFlashcard(item.content)
            const theme = (parsed.question || '未分類').trim() || '未分類'

            const key = item.review_material_id ? `rm:${item.review_material_id}` : `${subject}\n${theme}`

            if (!groups[key]) {
                groups[key] = {
                    key,
                    subject,
                    theme,
                    content: item.content,
                    latestCreatedAt: item.created_at,
                    attempts: [],
                    sm2_interval: item.sm2_interval ?? null,
                    sm2_ease_factor: item.sm2_ease_factor ?? null,
                    sm2_repetitions: item.sm2_repetitions ?? null,
                }
            }

            const current = groups[key]
            if (toMillis(item.created_at) > toMillis(current.latestCreatedAt)) {
                current.latestCreatedAt = item.created_at
            }
            if (current.sm2_interval == null && item.sm2_interval != null) current.sm2_interval = item.sm2_interval
            if (current.sm2_ease_factor == null && item.sm2_ease_factor != null) current.sm2_ease_factor = item.sm2_ease_factor
            if (current.sm2_repetitions == null && item.sm2_repetitions != null) current.sm2_repetitions = item.sm2_repetitions

            current.attempts.push({
                id: item.id,
                created_at: item.created_at,
                rating: item.rating,
            })
        })

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

        return Object.values(groups)
            .map((group) => {
                const attempts = [...group.attempts].sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))
                const latestAttempt = attempts[attempts.length - 1] ?? null

                const correctCount = attempts.filter((a) => a.rating === 'perfect' || a.rating === 'good').length
                const recentCorrectRatio = attempts.length > 0 ? correctCount / attempts.length : 0

                // ── 定数（後から調整しやすいよう分離）──
                const INTERVAL_MAX = 90
                const EASE_MIN = 1.3
                const EASE_MAX = 2.8
                const REP_MAX = 8
                const W_INTERVAL = 0.5
                const W_EASE = 0.2
                const W_REP = 0.3
                const DECAY_K = Math.LN2

                // ── Step1: 到達上限（Mastery Ceiling）──
                const sm2Interval = group.sm2_interval ?? 0
                const sm2Ease = group.sm2_ease_factor ?? EASE_MIN
                const sm2Reps = group.sm2_repetitions ?? 0

                let masteryCeiling: number
                if (sm2Reps === 0) {
                    masteryCeiling = 0.05
                } else {
                    const intervalNorm = clamp(Math.log(1 + sm2Interval) / Math.log(1 + INTERVAL_MAX), 0, 1)
                    const easeNorm = clamp((sm2Ease - EASE_MIN) / (EASE_MAX - EASE_MIN), 0, 1)
                    const repNorm = clamp(sm2Reps / REP_MAX, 0, 1)
                    masteryCeiling = intervalNorm * W_INTERVAL + easeNorm * W_EASE + repNorm * W_REP
                }

                // ── Step2: 時間減衰（Time Decay）──
                const intervalDays = Math.max(sm2Interval, 1)
                const elapsedMs = latestAttempt ? Date.now() - toMillis(latestAttempt.created_at) : 0
                const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)
                const decayRatio = elapsedDays / intervalDays
                const timeDecay = Math.exp(-DECAY_K * decayRatio)

                // ── Step3: 直近回答ペナルティ──
                const latestRating = latestAttempt?.rating ?? null
                let recentPenalty: number
                if (latestRating === 'hard') {
                    recentPenalty = 0.1
                } else if (latestRating === 'good') {
                    recentPenalty = 0.8
                } else {
                    recentPenalty = 1.0
                }

                // ── 最終スコア ──
                const retentionScore = clamp(Math.round(masteryCeiling * timeDecay * recentPenalty * 100), 0, 100)

                const retentionLabel = retentionScore >= 75 ? '高' : retentionScore >= 45 ? '中' : '低'
                const retentionColor = retentionScore >= 75 ? '#16a34a' : retentionScore >= 45 ? '#d97706' : '#dc2626'

                return {
                    ...group,
                    attempts,
                    latestAttempt,
                    retentionScore,
                    retentionLabel,
                    retentionColor,
                    recentCorrectRatio,
                }
            })
            .sort((a, b) => toMillis(b.latestCreatedAt) - toMillis(a.latestCreatedAt))
    }, [flashcardHistory])

    const filteredQuizHistory = useMemo(() => {
        if (!historyFilter) return groupedQuizHistory
        return groupedQuizHistory.filter((group) => {
            const hasIncorrect = group.attempts.some((a) => !a.is_correct)
            const hasFuzzy = group.attempts.some((a) => a.is_correct && a.rating === 'good')
            if (historyFilter === 'incorrect') return hasIncorrect
            if (historyFilter === 'fuzzy') return hasFuzzy
            if (historyFilter === 'both') return hasIncorrect || hasFuzzy
            return true
        })
    }, [groupedQuizHistory, historyFilter])

    const filteredFlashcardHistory = useMemo(() => {
        if (!historyFilter) return groupedFlashcardHistory
        return groupedFlashcardHistory.filter((group) => {
            const hasIncorrect = group.attempts.some((a) => a.rating === 'hard')
            const hasFuzzy = group.attempts.some((a) => a.rating === 'good')
            if (historyFilter === 'incorrect') return hasIncorrect
            if (historyFilter === 'fuzzy') return hasFuzzy
            if (historyFilter === 'both') return hasIncorrect || hasFuzzy
            return true
        })
    }, [groupedFlashcardHistory, historyFilter])

    // フラッシュカード形式のテーマを自動的にflashcardModeへ
    useEffect(() => {
        const updates: Record<string, boolean> = {}
        currentTasks.forEach((task) => {
            let themes = splitThemes(task.study_logs?.note || '')
            if (themes.length === 0) themes = ['全体復習']
            themes.forEach((theme) => {
                const themeKey = getThemeKey(task.id, theme)
                const flashcard = parseFlashcard(theme)
                if (flashcard.answer && !flashcardMode[themeKey]) {
                    updates[themeKey] = true
                }
            })
        })
        if (Object.keys(updates).length > 0) {
            setFlashcardMode((prev) => ({ ...prev, ...updates }))
        }
    }, [currentTasks])

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
                <View style={styles.cardHeaderColumn}>
                    <View style={styles.headerRow}>
                        <View style={[styles.headerTitleWrap, styles.headerTitleWrapTop]}>
                            <Text style={styles.cardTitle}>復習カード</Text>
                            <Text style={styles.cardSubtitle}>
                                {(selectedSubjectKey)
                                    ? (selectedSubjectKey ? groupedTasks.find(g => g.key === selectedSubjectKey)?.title : groupedTasks[0]?.title)
                                    : '忘却曲線に合わせて今日の復習を出題します'}
                            </Text>
                        </View>
                        {selectedSubjectKey ? (
                            <Pressable style={styles.backButton} onPress={() => setSelectedSubjectKey(null)}>
                                <Text style={styles.backButtonText}>戻る</Text>
                            </Pressable>
                        ) : null}
                    </View>
                    <View style={styles.headerButtons} pointerEvents="box-none">
                        <Pressable style={styles.contentButton} onPress={() => setShowContentModal(true)}>
                            <Ionicons name="document-text-outline" size={18} color="#64748b" />
                            <Text style={styles.contentButtonText}>内容</Text>
                        </Pressable>
                        <Pressable style={styles.futureButton} onPress={() => setShowFutureModal(true)}>
                            <Ionicons name="calendar-outline" size={18} color="#3b82f6" />
                            <Text style={styles.futureButtonText}>予定</Text>
                        </Pressable>
                        <Pressable
                            style={styles.futureButton}
                            onPress={() => {
                                setShowHistoryModal(true)
                            }}
                        >
                            <Ionicons name="time-outline" size={18} color="#64748b" />
                            <Text style={styles.futureButtonText}>履歴</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.futureButton, { backgroundColor: '#2563eb', borderColor: '#2563eb' }]}
                            onPress={() => {
                                if (selectedSubjectKey?.startsWith('book:')) {
                                    const bookId = selectedSubjectKey.slice(5)
                                    setSelectedBookId(bookId)
                                    setCreateModalBookLockedId(bookId)
                                } else {
                                    setCreateModalBookLockedId(null)
                                }
                                setShowCreateModal(true)
                            }}
                        >
                            <Ionicons name="add-circle" size={18} color="#ffffff" />
                            <Text style={[styles.futureButtonText, { color: '#ffffff' }]}>作成</Text>
                        </Pressable>
                    </View>
                </View>
                {(loading || (groupedTasks.length === 0 && !loading)) ? (
                    <>
                        {loading && <Text style={styles.mutedText}>読み込み中...</Text>}
                        {!loading && groupedTasks.length === 0 && (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconContainer}>
                                    <Ionicons name="checkmark-done-circle" size={64} color="#3b82f6" />
                                </View>
                                <Text style={styles.emptyTitle}>すべて完了！</Text>
                                <Text style={styles.emptySubtitle}>
                                    今日の復習タスクはありません{'\n'}
                                    新しいカードを作成して学習を始めましょう
                                </Text>
                                <Pressable
                                    style={styles.emptyActionButton}
                                    onPress={() => setShowCreateModal(true)}
                                >
                                    <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
                                    <Text style={styles.emptyActionText}>カードを作成</Text>
                                </Pressable>
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        {!selectedSubjectKey ? (
                            <View style={styles.subjectList}>
                                {groupedTasks.map((group) => (
                                    <Pressable
                                        key={group.key}
                                        style={styles.subjectCard}
                                        onPress={() => setSelectedSubjectKey(group.key)}
                                    >
                                        <View style={styles.subjectCardLeft}>
                                            <View style={styles.subjectIconBox}>
                                                {group.imageUrl ? (
                                                    <Image source={{ uri: group.imageUrl }} style={styles.subjectImage} />
                                                ) : (
                                                    <Ionicons name="book" size={24} color="#64748b" />
                                                )}
                                            </View>
                                            <View>
                                                <Text style={styles.subjectTitle}>{group.title}</Text>
                                                <View style={styles.badgeRow}>
                                                    <View style={styles.cnadge}>
                                                        <Text style={styles.cnadgeText}>{group.themeCount}件の復習</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                                    </Pressable>
                                ))}
                            </View>
                        ) : (
                            <View>

                                {currentTasks.length > 0 && (
                                    <Pressable
                                        style={[styles.bulkQuizButton, isGeneratingBulk && { opacity: 0.75 }]}
                                        onPress={handleGenerateFiveQuizzes}
                                        disabled={isGeneratingBulk}
                                    >
                                        <View style={styles.bulkQuizIconWrap}>
                                            <Ionicons name="sparkles-outline" size={18} color="#7c3aed" />
                                        </View>
                                        <Text style={styles.bulkQuizText}>
                                            {isGeneratingBulk ? '作成中...' : 'AIクイズを5テーマ分作成'}
                                        </Text>
                                    </Pressable>
                                )}

                                {currentTasks.map((task) => {
                                    const quiz = quizByTask[task.id]
                                    let themes = splitThemes(task.study_logs?.note || '')
                                    if (themes.length === 0) {
                                        themes = ['全体復習']
                                    }
                                    const visibleThemes = themes.filter((theme) => !(skippedThemes[task.id] || []).includes(theme) && !(completedThemesInTask[task.id] || []).includes(theme))

                                    if (visibleThemes.length === 0) return null

                                    return (
                                        <View key={task.id} style={styles.taskCard}>
                                            {visibleThemes.map((theme, index) => {
                                                const themeQuiz = quiz?.themes?.[theme]
                                                const themeKey = getThemeKey(task.id, theme)
                                                return (
                                                    <View key={`${task.id}-${index}`} style={styles.themeCard}>
                                                        <View style={styles.themeHeader}>
                                                            <Text style={styles.themeTitle}>{task.study_logs?.subject || '学習内容'}</Text>
                                                            <View style={styles.themeHeaderRight}>
                                                                <Text style={styles.mutedText}>{formatReviewDate(task.study_logs?.started_at)}</Text>
                                                                {getOverdueDays(task.due_at) > 0 && (
                                                                    <View style={styles.overdueBadge}>
                                                                        <Text style={styles.overdueBadgeText}>⚠️ {getOverdueDays(task.due_at)}日遅れ</Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                        {!parseFlashcard(theme).answer && (
                                                            <View style={styles.themeBadge}>
                                                                <Ionicons name="pricetag-outline" size={12} color="#475569" />
                                                                <Text style={styles.themeBadgeText}>{theme}</Text>
                                                            </View>
                                                        )}

                                                        {!themeQuiz && !flashcardMode[themeKey] && (() => {
                                                            const flashcard = parseFlashcard(theme)
                                                            // フラッシュカードモード（答えあり）: useEffectで自動起動するため何も表示しない
                                                            if (flashcard.answer) {
                                                                return null
                                                            }
                                                            // AIモード（答えなし）: AIクイズボタンのみ
                                                            return (
                                                                <Pressable style={styles.outlineButton} onPress={() => handleGenerateQuiz(task, theme)}>
                                                                    <Text style={styles.outlineButtonText}>AIクイズを作成</Text>
                                                                </Pressable>
                                                            )
                                                        })()}
                                                        {flashcardMode[themeKey] && (() => {
                                                            const flashcard = parseFlashcard(theme)
                                                            const isShowing = showingAnswer[themeKey]
                                                            return (
                                                                <View style={styles.flashcardContainer}>
                                                                    <View style={styles.flashcardCard}>
                                                                        <Text style={styles.flashcardLabel}>問題</Text>
                                                                        <Text style={styles.flashcardQuestion}>{flashcard.question}</Text>
                                                                        {isShowing && (
                                                                            <>
                                                                                <Text style={[styles.flashcardLabel, styles.answerLabel]}>答え</Text>
                                                                                <Text style={styles.flashcardAnswer}>{flashcard.answer}</Text>
                                                                            </>
                                                                        )}
                                                                    </View>
                                                                    {!isShowing ? (
                                                                        <Pressable style={[styles.outlineButton, styles.showAnswerButton]} onPress={() => handleShowAnswer(task.id, theme)}>
                                                                            <Text style={styles.outlineButtonText}>答えを見る</Text>
                                                                        </Pressable>
                                                                    ) : (
                                                                        <View style={styles.flashcardActions}>
                                                                            <Pressable style={[styles.outlineButton, styles.perfectButton]} onPress={() => handleSM2Rating(task.id, theme, 'perfect', 'flashcard')}>
                                                                                <Text style={[styles.outlineButtonText, styles.perfectButtonText]}>完璧 ⭐</Text>
                                                                            </Pressable>
                                                                            <Pressable style={[styles.outlineButton, styles.goodButton]} onPress={() => handleSM2Rating(task.id, theme, 'good', 'flashcard')}>
                                                                                <Text style={[styles.outlineButtonText, styles.goodButtonText]}>うろ覚え 🤔</Text>
                                                                            </Pressable>
                                                                            <Pressable style={[styles.outlineButton, styles.hardButton]} onPress={() => handleSM2Rating(task.id, theme, 'hard', 'flashcard')}>
                                                                                <Text style={[styles.outlineButtonText, styles.hardButtonText]}>苦手 😓</Text>
                                                                            </Pressable>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            )
                                                        })()}
                                                        {themeQuiz?.loading && (
                                                            <View style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                backgroundColor: '#eff6ff',
                                                                paddingVertical: 16,
                                                                paddingHorizontal: 20,
                                                                borderRadius: 12,
                                                                marginTop: 12,
                                                                marginBottom: 8,
                                                                borderWidth: 1,
                                                                borderColor: '#bfdbfe',
                                                                shadowColor: '#3b82f6',
                                                                shadowOffset: { width: 0, height: 2 },
                                                                shadowOpacity: 0.1,
                                                                shadowRadius: 4,
                                                                elevation: 2
                                                            }}>
                                                                <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 12 }} />
                                                                <Text style={{
                                                                    color: '#1d4ed8',
                                                                    fontSize: 15,
                                                                    fontWeight: '600',
                                                                    letterSpacing: 0.5
                                                                }}>
                                                                    問題を作成中...
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {themeQuiz?.questions?.length > 0 && (
                                                            <View style={styles.quizBlock}>
                                                                {themeQuiz.questions.map((q, qIndex) => {
                                                                    const answered = themeQuiz.answers[qIndex] !== undefined
                                                                    return (
                                                                        <View key={`${task.id}-${qIndex}`} style={styles.quizItem}>
                                                                            <Text style={styles.quizQuestion}>{qIndex + 1}. {q.question}</Text>
                                                                            {q.choices.map((choice, cIndex) => {
                                                                                const selected = themeQuiz.answers[qIndex] === cIndex
                                                                                const isCorrect = q.correct_index === cIndex
                                                                                return (
                                                                                    <Pressable
                                                                                        key={`${task.id}-${qIndex}-${cIndex}`}
                                                                                        onPress={() => handleAnswer(task.id, theme, qIndex, cIndex)}
                                                                                        disabled={answered}
                                                                                        style={[
                                                                                            styles.choiceButton,
                                                                                            selected && (isCorrect ? styles.choiceCorrect : styles.choiceWrong),
                                                                                        ]}
                                                                                    >
                                                                                        <Text style={styles.choiceText}>{choice}</Text>
                                                                                    </Pressable>
                                                                                )
                                                                            })}
                                                                            {!answered && (
                                                                                <>
                                                                                    <Pressable
                                                                                        style={[styles.outlineButton, styles.dontKnowButton]}
                                                                                        onPress={() => handleAnswer(task.id, theme, qIndex, -1)}
                                                                                    >
                                                                                        <Text style={[styles.outlineButtonText, styles.dontKnowButtonText]}>わからない 🤷</Text>
                                                                                    </Pressable>
                                                                                    {editingThemeKey === themeKey ? (
                                                                                        <View style={styles.editThemeContainer}>
                                                                                            <TextInput
                                                                                                style={styles.editThemeInput}
                                                                                                value={editingThemeText}
                                                                                                onChangeText={setEditingThemeText}
                                                                                                multiline
                                                                                                autoFocus
                                                                                                placeholder="テーマを編集してください"
                                                                                            />
                                                                                            <View style={styles.editThemeActions}>
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.editThemeCancelButton]}
                                                                                                    onPress={() => { setEditingThemeKey(null); setEditingThemeText('') }}
                                                                                                >
                                                                                                    <Text style={styles.outlineButtonText}>キャンセル</Text>
                                                                                                </Pressable>
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.editThemeSubmitButton]}
                                                                                                    onPress={() => handleEditTheme(task, theme, editingThemeText)}
                                                                                                >
                                                                                                    <Text style={[styles.outlineButtonText, styles.editThemeSubmitText]}>これで作り直す ✨</Text>
                                                                                                </Pressable>
                                                                                            </View>
                                                                                        </View>
                                                                                    ) : (
                                                                                        <Pressable
                                                                                            style={[styles.outlineButton, styles.editThemeButton]}
                                                                                            onPress={() => { setEditingThemeKey(themeKey); setEditingThemeText(theme) }}
                                                                                        >
                                                                                            <Text style={[styles.outlineButtonText, styles.editThemeButtonText]}>✏️ テーマを編集して作り直す</Text>
                                                                                        </Pressable>
                                                                                    )}
                                                                                </>
                                                                            )}

                                                                            {answered && (
                                                                                <View style={{ marginTop: 8 }}>
                                                                                    <Text style={styles.mutedText}>
                                                                                        正解: {q.correct_index + 1}番
                                                                                    </Text>
                                                                                    {q.explanation && (
                                                                                        <>
                                                                                            <Text style={styles.explanationText}>
                                                                                                {q.explanation}
                                                                                            </Text>
                                                                                            <Pressable
                                                                                                style={[styles.outlineButton, styles.askAIButtonInline, askAILoading && { opacity: 0.6 }]}
                                                                                                onPress={() => openAskAIModalFromExplanation(task, theme, q)}
                                                                                                disabled={askAILoading}
                                                                                            >
                                                                                                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#7c3aed" />
                                                                                                <Text style={[styles.outlineButtonText, styles.askAIButtonInlineText]}>
                                                                                                    AIに質問
                                                                                                </Text>
                                                                                            </Pressable>
                                                                                        </>
                                                                                    )}
                                                                                    {(() => {
                                                                                        const isAllAnswered = themeQuiz.questions.every((_, i) => themeQuiz.answers[i] !== undefined)
                                                                                        if (!isAllAnswered) return null

                                                                                        const isIncorrect = themeQuiz.questions.some((quizQ, idx) => {
                                                                                            const ans = themeQuiz.answers[idx]
                                                                                            return ans !== undefined && ans !== quizQ.correct_index
                                                                                        })

                                                                                        if (isIncorrect) {
                                                                                            return (
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.hardButton, { marginTop: 12 }]}
                                                                                                    onPress={() => handleSM2Rating(task.id, theme, 'hard', 'quiz')}
                                                                                                >
                                                                                                    <Text style={[styles.outlineButtonText, styles.hardButtonText]}>次へ（不正解のため明日に再復習）</Text>
                                                                                                </Pressable>
                                                                                            )
                                                                                        } else {
                                                                                            return (
                                                                                                <View style={[styles.flashcardActions, { marginTop: 12 }]}>
                                                                                                    <Pressable
                                                                                                        style={[styles.outlineButton, styles.perfectButton, { flex: 1 }]}
                                                                                                        onPress={() => handleSM2Rating(task.id, theme, 'perfect', 'quiz')}
                                                                                                    >
                                                                                                        <Text style={[styles.outlineButtonText, styles.perfectButtonText]}>完璧 ⭐</Text>
                                                                                                    </Pressable>
                                                                                                    <Pressable
                                                                                                        style={[styles.outlineButton, styles.goodButton, { flex: 1 }]}
                                                                                                        onPress={() => handleSM2Rating(task.id, theme, 'good', 'quiz')}
                                                                                                    >
                                                                                                        <Text style={[styles.outlineButtonText, styles.goodButtonText]}>うろ覚え 🤔</Text>
                                                                                                    </Pressable>
                                                                                                </View>
                                                                                            )
                                                                                        }
                                                                                    })()}
                                                                                </View>
                                                                            )}
                                                                        </View>
                                                                    )
                                                                })}
                                                            </View>
                                                        )}
                                                    </View>
                                                )
                                            })}
                                        </View>
                                    )
                                })}
                                {currentTasks.every(t => {
                                    const themes = splitThemes(t.study_logs?.note || '')
                                    // Check if all themes for this task are skipped/hidden
                                    const visible = themes.filter((theme) => !(skippedThemes[t.id] || []).includes(theme) && !(completedThemesInTask[t.id] || []).includes(theme))
                                    return visible.length === 0
                                }) && (
                                        <View style={[styles.emptyState, { marginTop: 40, backgroundColor: 'transparent' }]}>
                                            <View style={styles.emptyIconContainer}>
                                                <Ionicons name="trophy" size={56} color="#fbbf24" />
                                            </View>
                                            <Text style={styles.emptyTitle}>復習コンプリート！</Text>
                                            <Text style={[styles.emptySubtitle, { color: '#64748b', marginBottom: 30 }]}>
                                                この教材の復習はすべて完了しました！{'\n'}
                                                素晴らしい進捗です。
                                            </Text>
                                            <Pressable style={styles.emptyActionButton} onPress={() => setSelectedSubjectKey(null)}>
                                                <Ionicons name="list" size={20} color="#ffffff" />
                                                <Text style={styles.emptyActionText}>一覧に戻る</Text>
                                            </Pressable>
                                        </View>
                                    )}
                            </View>
                        )}
                    </>
                )}
            </View>

            {/* 明日以降の復習予定モーダル */}
            <Modal
                visible={showAskAIModal}
                animationType="slide"
                transparent
                onRequestClose={closeAskAIModal}
            >
                <KeyboardAvoidingView
                    style={styles.askAIModalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.askAIModalCard}>
                        <ScrollView
                            style={styles.askAIModalScroll}
                            contentContainerStyle={styles.askAIModalScrollContent}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                            showsVerticalScrollIndicator
                        >
                            <View style={styles.askAIModalHeader}>
                                <Text style={styles.askAIModalTitle}>AIに質問</Text>
                                <Pressable onPress={closeAskAIModal} disabled={askAILoading} hitSlop={10}>
                                    <Ionicons name="close" size={22} color="#64748b" />
                                </Pressable>
                            </View>
                            <Text style={styles.askAIModalThemeText}>
                                {askAIContext ? `${askAIContext.subject} / ${askAIContext.theme}` : ''}
                            </Text>

                            <Text style={styles.askAIModalLabel}>質問内容</Text>
                            <TextInput
                                style={styles.askAIModalInput}
                                value={askAIInput}
                                onChangeText={setAskAIInput}
                                multiline
                                placeholder="この解説のここが分からない、などを入力"
                                textAlignVertical="top"
                                editable={!askAILoading}
                            />

                            <View style={styles.askAIModalActions}>
                                <Pressable style={styles.askAISecondaryButton} onPress={closeAskAIModal} disabled={askAILoading}>
                                    <Text style={styles.askAISecondaryButtonText}>閉じる</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.askAIPrimaryButton, askAILoading && { opacity: 0.7 }]}
                                    onPress={handleSubmitAskAI}
                                    disabled={askAILoading}
                                >
                                    <Text style={styles.askAIPrimaryButtonText}>
                                        {askAILoading ? '質問中...' : 'AIに質問'}
                                    </Text>
                                </Pressable>
                            </View>

                            {askAILoading && (
                                <View style={styles.askAILoadingWrap}>
                                    <ActivityIndicator size="small" color="#7c3aed" />
                                </View>
                            )}

                            {askAIAnswer ? (
                                <View style={styles.askAIAnswerCard}>
                                    <Text style={styles.askAIAnswerLabel}>AIの回答</Text>
                                    <ScrollView style={styles.askAIAnswerScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                                        <Text style={styles.askAIAnswerText}>{askAIAnswer}</Text>
                                    </ScrollView>
                                    <Text style={styles.askAIAnswerHint}>この質問と回答はテーマ履歴に保存されます。</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                visible={showFutureModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setShowFutureModal(false)}
            >
                <View style={styles.futureModalRoot}>
                    <View style={styles.futureModalHeader}>
                        <View style={styles.futureModalTitleRow}>
                            <View style={styles.futureModalTitleIcon}>
                                <Ionicons name="calendar" size={22} color="#3b82f6" />
                            </View>
                            <Text style={styles.futureModalTitle}>明日以降の復習予定</Text>
                        </View>
                        <Pressable onPress={() => setShowFutureModal(false)} style={styles.backButton}>
                            <Text style={styles.backButtonText}>戻る</Text>
                        </Pressable>
                    </View>
                    <ScrollView style={styles.futureModalBody} contentContainerStyle={styles.futureModalBodyContent} showsVerticalScrollIndicator={false}>
                        {futureTasksLoading ? (
                            <View style={styles.futureEmptyState}>
                                <Text style={styles.futureEmptyText}>読み込み中...</Text>
                            </View>
                        ) : groupedFutureTasks.length === 0 ? (
                            <View style={styles.futureEmptyState}>
                                <View style={styles.futureEmptyIconWrap}>
                                    <Ionicons name="checkmark-done-circle" size={52} color="#3b82f6" />
                                </View>
                                <Text style={styles.futureEmptyText}>明日以降の復習予定はありません</Text>
                                <Text style={styles.futureEmptySubtext}>復習を完了するとここに予定が追加されます</Text>
                            </View>
                        ) : (
                            groupedFutureTasks.map((group) => (
                                <View key={group.date} style={styles.futureDateGroup}>
                                    <View style={styles.futureDateHeader}>
                                        <View style={styles.futureDateHeaderLeft}>
                                            <Ionicons name="time-outline" size={16} color="#64748b" />
                                            <Text style={styles.futureDateLabel}>{group.dateLabel}</Text>
                                        </View>
                                        <View style={styles.futureCountBadge}>
                                            <Text style={styles.futureCountText}>{group.relativeLabel}</Text>
                                        </View>
                                    </View>
                                    {group.themes.map((item, idx) => (
                                        <View key={`${group.date}-${idx}`} style={[styles.futureThemeRow, idx === 0 && styles.futureThemeRowFirst]}>
                                            <Text style={styles.futureSubjectText} numberOfLines={1}>{item.subject}</Text>
                                            <Text style={styles.futureThemeText} numberOfLines={3}>
                                                {item.theme}{item.startedAt ? `（${formatDateLabel(getStudyDayDate(getStudyDay(new Date(item.startedAt))))}）` : ''}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ))
                        )}
                    </ScrollView>
                </View>
            </Modal>

            {/* 履歴モーダル（プレミアムデザイン） */}
            <Modal
                visible={showHistoryModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setShowHistoryModal(false)}
            >
                <View style={styles.historyPremiumRoot}>
                    <View style={styles.historyPremiumHeader}>
                        <View style={styles.historyPremiumTitleRow}>
                            <View style={styles.historyPremiumTitleIcon}>
                                <Ionicons name="time" size={22} color="#10b981" />
                            </View>
                            <Text style={styles.historyPremiumTitle}>復習履歴</Text>
                        </View>
                        <View style={styles.historyPremiumHeaderActions}>
                            <Pressable onPress={() => loadHistory()} style={styles.historyPremiumRefreshBtn} hitSlop={12} disabled={historyLoading}>
                                <Ionicons name="refresh" size={22} color={historyLoading ? '#94a3b8' : '#64748b'} />
                            </Pressable>
                            <Pressable onPress={() => setShowHistoryModal(false)} style={styles.backButton}>
                                <Text style={styles.backButtonText}>戻る</Text>
                            </Pressable>
                        </View>
                    </View>
                    <ScrollView style={styles.historyPremiumBody} contentContainerStyle={styles.historyPremiumBodyContent} showsVerticalScrollIndicator={false}>

                        <View style={styles.historyTabsContainer}>
                            <Pressable
                                style={[styles.historyTab, historyTab === 'ai' && styles.historyTabActive]}
                                onPress={() => setHistoryTab('ai')}
                            >
                                <Ionicons name="scan-circle-outline" size={18} color={historyTab === 'ai' ? '#2563eb' : '#64748b'} />
                                <Text style={[styles.historyTabText, historyTab === 'ai' && styles.historyTabTextActive]}>AIモード</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.historyTab, historyTab === 'flashcard' && styles.historyTabActive]}
                                onPress={() => setHistoryTab('flashcard')}
                            >
                                <Ionicons name="albums-outline" size={18} color={historyTab === 'flashcard' ? '#2563eb' : '#64748b'} />
                                <Text style={[styles.historyTabText, historyTab === 'flashcard' && styles.historyTabTextActive]}>単語帳</Text>
                            </Pressable>
                        </View>

                        {/* フィルターバー */}
                        <View style={styles.historyFilterBar}>
                            {([
                                { key: null, label: 'すべて', icon: 'list-outline' },
                                { key: 'incorrect', label: '不正解', icon: 'close-circle-outline' },
                                { key: 'fuzzy', label: 'うろ覚え', icon: 'help-circle-outline' },
                            ] as const).map(({ key, label, icon }) => (
                                <Pressable
                                    key={String(key)}
                                    style={[styles.historyFilterChip, historyFilter === key && styles.historyFilterChipActive]}
                                    onPress={() => setHistoryFilter(key as any)}
                                >
                                    <Ionicons name={icon as any} size={14} color={historyFilter === key ? '#ffffff' : '#64748b'} />
                                    <Text style={[styles.historyFilterChipText, historyFilter === key && styles.historyFilterChipTextActive]}>
                                        {label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <View>
                            {historyErrorMessage && (
                                <View style={styles.historyPremiumErrorBox}>
                                    <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                                    <Text style={styles.historyPremiumErrorText}>{historyErrorMessage}</Text>
                                </View>
                            )}
                            {historyLoading ? (
                                <View style={styles.historyPremiumEmptyState}>
                                    <ActivityIndicator size="large" color="#10b981" />
                                </View>
                            ) : historyTab === 'ai' ? (
                                filteredQuizHistory.length === 0 ? (
                                    <View style={styles.historyPremiumEmptyState}>
                                        <View style={styles.historyPremiumEmptyIconWrap}>
                                            <Ionicons name="document-text-outline" size={52} color="#cbd5e1" />
                                        </View>
                                        <Text style={styles.historyPremiumEmptyText}>AI問題の記録がありません</Text>
                                        <Text style={styles.historyPremiumEmptySubtext}>クイズを解くとここに表示されます</Text>
                                    </View>
                                ) : (
                                    filteredQuizHistory.map((group) => (
                                        <View key={group.key} style={styles.historyPremiumCard}>
                                            <View style={styles.historyPremiumCardHeader}>
                                                <Text style={styles.historyPremiumDate}>{formatHistoryDate(group.latestCreatedAt)}</Text>
                                                <View style={styles.historyPremiumSubjectBadge}>
                                                    <Text style={styles.historyPremiumSubjectText}>{group.subject}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.historyPremiumTheme}>{group.theme}</Text>
                                            <View style={styles.historyTrendMetaRow}>
                                                <Text style={styles.historyTrendMetaText}>解答回数: {group.attempts.length}回</Text>
                                                <Text style={styles.historyTrendMetaText}>正答率: {Math.round(group.recentCorrectRatio * 100)}%</Text>
                                            </View>
                                            <View style={styles.historyPremiumDivider} />

                                            <View style={styles.historyRetentionSection}>
                                                <View style={styles.historyRetentionHeader}>
                                                    <Text style={styles.historyRetentionTitle}>記憶定着度（SM-2）</Text>
                                                    <Text style={[styles.historyRetentionPercent, { color: group.retentionColor }]}>
                                                        {group.retentionScore}%（{group.retentionLabel}）
                                                    </Text>
                                                </View>
                                                <View style={styles.historyRetentionTrack}>
                                                    <View
                                                        style={[
                                                            styles.historyRetentionFill,
                                                            { width: `${group.retentionScore}%`, backgroundColor: group.retentionColor },
                                                        ]}
                                                    />
                                                </View>
                                            </View>

                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyTrendScrollContent}>
                                                {group.attempts.map((attempt, idx) => {
                                                    let label = '不正解'
                                                    let chipColor = '#ef4444' // red
                                                    let chipBg = '#fef2f2'

                                                    if (attempt.is_correct) {
                                                        if (attempt.rating === 'good') {
                                                            label = 'うろ覚え'
                                                            chipColor = '#d97706' // orange/yellow
                                                            chipBg = '#fef3c7'
                                                        } else {
                                                            label = '完璧'
                                                            chipColor = '#16a34a' // green
                                                            chipBg = '#ecfdf5'
                                                        }
                                                    }
                                                    return (
                                                        <View key={attempt.id} style={styles.historyTrendStep}>
                                                            <View style={[styles.historyTrendChip, { backgroundColor: chipBg, borderColor: chipColor }]}>
                                                                <Ionicons
                                                                    name={attempt.is_correct ? 'checkmark-circle' : 'close-circle'}
                                                                    size={16}
                                                                    color={chipColor}
                                                                />
                                                                <Text style={[styles.historyTrendChipText, { color: chipColor }]}>{label}</Text>
                                                                <Text style={styles.historyTrendChipDate}>{formatHistoryDate(attempt.created_at)}</Text>
                                                            </View>
                                                            {idx < group.attempts.length - 1 && (
                                                                <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={styles.historyTrendArrow} />
                                                            )}
                                                        </View>
                                                    )
                                                })}
                                            </ScrollView>

                                            {(group.attempts.length > 0 || group.qaLogs.length > 0) && (
                                                <View style={styles.historyPremiumExplanationBox}>
                                                    {/* 最新の試行をデフォルト表示 */}
                                                    <Text style={styles.historyPremiumExplanationLabel}>直近の問題</Text>
                                                    <Text style={styles.historyPremiumExplanationText}>{group.latestAttempt?.question}</Text>

                                                    {group.latestAttempt?.choices && group.latestAttempt.choices.length > 0 && (
                                                        <View style={{ marginTop: 8, gap: 6 }}>
                                                            {group.latestAttempt.choices.map((choice, cIndex) => {
                                                                const hasSelected = group.latestAttempt!.selected_index >= 0 && group.latestAttempt!.selected_index < group.latestAttempt!.choices.length
                                                                const hasCorrect = group.latestAttempt!.correct_index >= 0 && group.latestAttempt!.correct_index < group.latestAttempt!.choices.length
                                                                const isSelected = hasSelected && cIndex === group.latestAttempt!.selected_index
                                                                const isCorrectChoice = hasCorrect && cIndex === group.latestAttempt!.correct_index
                                                                let choiceStyle: any = styles.historyPremiumChoice
                                                                if (isCorrectChoice) {
                                                                    choiceStyle = [styles.historyPremiumChoice, styles.historyPremiumChoiceCorrect]
                                                                } else if (isSelected) {
                                                                    choiceStyle = [styles.historyPremiumChoice, styles.historyPremiumChoiceWrong]
                                                                }
                                                                return (
                                                                    <View key={cIndex} style={choiceStyle}>
                                                                        <Text style={[styles.historyPremiumChoiceText, isCorrectChoice && { color: '#166534', fontWeight: 'bold' }, isSelected && !isCorrectChoice && { color: '#991b1b' }]}>
                                                                            {choice}
                                                                        </Text>
                                                                    </View>
                                                                )
                                                            })}
                                                        </View>
                                                    )}

                                                    {group.latestAttempt?.explanation && (
                                                        <>
                                                            <Text style={[styles.historyPremiumExplanationLabel, { marginTop: 12 }]}>直近の解説</Text>
                                                            <Text style={styles.historyPremiumExplanationText}>{group.latestAttempt.explanation}</Text>
                                                        </>
                                                    )}

                                                    {group.qaLogs.length > 0 && (
                                                        <View style={styles.historyQASection}>
                                                            <Text style={[styles.historyPremiumExplanationLabel, { marginTop: 12 }]}>AI質問履歴</Text>
                                                            {[...group.qaLogs].reverse().map((qaLog) => (
                                                                <View key={qaLog.id} style={styles.historyQAItem}>
                                                                    <Text style={styles.historyQAMeta}>
                                                                        {formatHistoryDate(qaLog.created_at)}
                                                                    </Text>
                                                                    <Text style={styles.historyQAQuestion}>Q. {qaLog.question}</Text>
                                                                    <Text style={styles.historyQAAnswer}>A. {qaLog.answer}</Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}

                                                    {group.attempts.length > 1 && (
                                                        <Pressable
                                                            style={styles.historyMoreButton}
                                                            onPress={() =>
                                                                setExpandedHistoryGroups((prev) => ({
                                                                    ...prev,
                                                                    [group.key]: !prev[group.key],
                                                                }))
                                                            }
                                                        >
                                                            <Text style={styles.historyMoreButtonText}>
                                                                {expandedHistoryGroups[group.key] ? '詳細を閉じる' : `過去 ${group.attempts.length - 1} 回の出題を見る`}
                                                            </Text>
                                                        </Pressable>
                                                    )}

                                                    {/* 過去すべての試行を展開表示 */}
                                                    {expandedHistoryGroups[group.key] && (
                                                        <View style={styles.historyAttemptsList}>
                                                            {[...group.attempts].reverse().map((attempt, idx) => (
                                                                <View key={attempt.id} style={styles.historyAttemptItem}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                                        <Ionicons name={attempt.is_correct ? "checkmark-circle" : "close-circle"} size={16} color={attempt.is_correct ? "#16a34a" : "#ef4444"} />
                                                                        <Text style={styles.historyAttemptTitle}>
                                                                            {group.attempts.length - Math.abs(idx)}回目（{formatHistoryDate(attempt.created_at)}）
                                                                        </Text>
                                                                    </View>
                                                                    <Text style={styles.historyAttemptQuestion}>{attempt.question}</Text>
                                                                    {attempt.choices?.length > 0 && (
                                                                        <View style={styles.historyAttemptChoices}>
                                                                            {attempt.choices.map((choice, cIndex) => {
                                                                                const hasSelected = attempt.selected_index >= 0 && attempt.selected_index < attempt.choices.length
                                                                                const hasCorrect = attempt.correct_index >= 0 && attempt.correct_index < attempt.choices.length
                                                                                const isSelected = hasSelected && cIndex === attempt.selected_index
                                                                                const isCorrectChoice = hasCorrect && cIndex === attempt.correct_index
                                                                                let choiceStyle: any = [styles.historyPremiumChoice, { paddingVertical: 8, paddingHorizontal: 12 }]
                                                                                if (isCorrectChoice) {
                                                                                    choiceStyle.push(styles.historyPremiumChoiceCorrect)
                                                                                } else if (isSelected) {
                                                                                    choiceStyle.push(styles.historyPremiumChoiceWrong)
                                                                                }
                                                                                return (
                                                                                    <View key={cIndex} style={choiceStyle}>
                                                                                        <Text style={[styles.historyPremiumChoiceText, { fontSize: 13 }, isCorrectChoice && { color: '#166534', fontWeight: 'bold' }, isSelected && !isCorrectChoice && { color: '#991b1b' }]}>
                                                                                            {choice}
                                                                                        </Text>
                                                                                    </View>
                                                                                )
                                                                            })}
                                                                        </View>
                                                                    )}
                                                                    {attempt.explanation && (
                                                                        <>
                                                                            <Text style={[styles.historyPremiumExplanationLabel, { marginTop: 8, fontSize: 11 }]}>解説</Text>
                                                                            <Text style={styles.historyAttemptExplanation}>{attempt.explanation}</Text>
                                                                        </>
                                                                    )}
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    ))
                                )
                            ) : (
                                filteredFlashcardHistory.length === 0 ? (
                                    <View style={styles.historyPremiumEmptyState}>
                                        <View style={styles.historyPremiumEmptyIconWrap}>
                                            <Ionicons name="albums-outline" size={52} color="#cbd5e1" />
                                        </View>
                                        <Text style={styles.historyPremiumEmptyText}>単語帳の記録がありません</Text>
                                        <Text style={styles.historyPremiumEmptySubtext}>単語帳を学習するとここに表示されます</Text>
                                    </View>
                                ) : (
                                    filteredFlashcardHistory.map((group) => {
                                        const { question, answer } = parseFlashcard(group.content)
                                        return (
                                            <View key={group.key} style={styles.historyPremiumCard}>
                                                <View style={styles.historyPremiumCardHeader}>
                                                    <Text style={styles.historyPremiumDate}>{formatHistoryDate(group.latestCreatedAt)}</Text>
                                                    <View style={styles.historyPremiumSubjectBadge}>
                                                        <Text style={styles.historyPremiumSubjectText}>{group.subject}</Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.historyPremiumTheme}>{group.theme}</Text>
                                                <View style={styles.historyTrendMetaRow}>
                                                    <Text style={styles.historyTrendMetaText}>学習回数: {group.attempts.length}回</Text>
                                                    <Text style={styles.historyTrendMetaText}>定着率: {Math.round(group.recentCorrectRatio * 100)}%</Text>
                                                </View>
                                                <View style={styles.historyPremiumDivider} />

                                                <View style={styles.historyRetentionSection}>
                                                    <View style={styles.historyRetentionHeader}>
                                                        <Text style={styles.historyRetentionTitle}>記憶定着度（SM-2）</Text>
                                                        <Text style={[styles.historyRetentionPercent, { color: group.retentionColor }]}>
                                                            {group.retentionScore}%（{group.retentionLabel}）
                                                        </Text>
                                                    </View>
                                                    <View style={styles.historyRetentionTrack}>
                                                        <View
                                                            style={[
                                                                styles.historyRetentionFill,
                                                                { width: `${group.retentionScore}%`, backgroundColor: group.retentionColor },
                                                            ]}
                                                        />
                                                    </View>
                                                </View>

                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyTrendScrollContent}>
                                                    {group.attempts.map((attempt, idx) => {
                                                        const ratingLabel = attempt.rating === 'perfect' ? '完璧' : attempt.rating === 'good' ? 'うろ覚え' : '苦手'
                                                        const ratingColor = attempt.rating === 'perfect' ? '#2563eb' : attempt.rating === 'good' ? '#d97706' : '#dc2626'
                                                        const ratingBg = attempt.rating === 'perfect' ? '#dbeafe' : attempt.rating === 'good' ? '#fef3c7' : '#fee2e2'
                                                        return (
                                                            <View key={attempt.id} style={styles.historyTrendStep}>
                                                                <View style={[styles.historyTrendChip, { backgroundColor: ratingBg, borderColor: ratingColor }]}>
                                                                    <Ionicons
                                                                        name="checkmark-circle"
                                                                        size={16}
                                                                        color={ratingColor}
                                                                    />
                                                                    <Text style={[styles.historyTrendChipText, { color: ratingColor }]}>{ratingLabel}</Text>
                                                                    <Text style={styles.historyTrendChipDate}>{formatHistoryDate(attempt.created_at)}</Text>
                                                                </View>
                                                                {idx < group.attempts.length - 1 && (
                                                                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={styles.historyTrendArrow} />
                                                                )}
                                                            </View>
                                                        )
                                                    })}
                                                </ScrollView>

                                                <View style={styles.historyPremiumExplanationBox}>
                                                    <Text style={styles.historyPremiumExplanationLabel}>カードの内容</Text>
                                                    <View style={[styles.historyPremiumFlashcardQA, { padding: 0, marginTop: 12, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0 }]}>
                                                        <View style={styles.historyPremiumFlashcardRow}>
                                                            <View style={[styles.historyPremiumQABadge, { backgroundColor: '#eff6ff' }]}>
                                                                <Text style={[styles.historyPremiumQABadgeText, { color: '#2563eb' }]}>Q</Text>
                                                            </View>
                                                            <Text style={styles.historyPremiumFlashcardQText}>{question}</Text>
                                                        </View>
                                                        {answer && (
                                                            <View style={[styles.historyPremiumFlashcardRow, { marginTop: 16 }]}>
                                                                <View style={[styles.historyPremiumQABadge, { backgroundColor: '#f0fdf4' }]}>
                                                                    <Text style={[styles.historyPremiumQABadgeText, { color: '#16a34a' }]}>A</Text>
                                                                </View>
                                                                <Text style={styles.historyPremiumFlashcardAText}>{answer}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>

                                            </View>
                                        )
                                    })
                                )
                            )}
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* 学習内容の確認・編集モーダル */}
            <Modal
                visible={showContentModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => {
                    setShowContentModal(false)
                    setEditingContentTheme(null)
                }}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.contentModalHeader}>
                        <Text style={styles.contentModalTitle}>学習内容の確認・編集</Text>
                        <Pressable onPress={() => { setShowContentModal(false); setEditingContentTheme(null) }} style={styles.backButton}>
                            <Text style={styles.backButtonText}>戻る</Text>
                        </Pressable>
                    </View>
                    <KeyboardAwareScrollView
                        style={styles.contentModalRoot}
                        contentContainerStyle={styles.contentModalBodyContent}
                        keyboardShouldPersistTaps="handled"
                        innerRef={(ref) => { contentModalKeyboardRef.current = ref }}
                        onKeyboardWillShow={() => retryKeyboardAwareUpdate(contentModalKeyboardRef)}
                        onKeyboardDidShow={() => retryKeyboardAwareUpdate(contentModalKeyboardRef)}
                        enableOnAndroid
                        extraScrollHeight={120}
                        extraHeight={80}
                        viewIsInsideTabBar
                        keyboardOpeningTime={500}
                        enableResetScrollToCoords={false}
                    >
                        {contentMaterials.length === 0 ? (
                            <View style={styles.contentEmptyState}>
                                <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
                                <Text style={styles.contentEmptyText}>学習内容がありません</Text>
                                <Text style={styles.contentEmptySubtext}>復習カードを作成するとここに表示されます</Text>
                            </View>
                        ) : (
                            contentMaterials.map((material) => {
                                let lines = (material.content || '').split('\n')
                                if (lines.length === 0) lines = ['']
                                const themesWithIndex: { theme: string; lineIndex: number }[] = []
                                lines.forEach((line, i) => {
                                    const t = line.trim()
                                    if (t) themesWithIndex.push({ theme: t, lineIndex: i })
                                })
                                if (themesWithIndex.length === 0) themesWithIndex.push({ theme: '全体復習', lineIndex: 0 })
                                const studyDateLabel = material.study_date
                                    ? formatDateLabel(new Date(material.study_date))
                                    : (material.created_at ? formatDateLabel(new Date(material.created_at)) : '—')
                                return (
                                    <View key={material.id} style={styles.contentCard}>
                                        <View style={styles.contentCardHeader}>
                                            <Text style={styles.contentCardDate} numberOfLines={1}>{studyDateLabel}</Text>
                                            <Text style={styles.contentCardSubject} numberOfLines={1}>{material.subject || 'その他'}</Text>
                                            <Pressable onPress={() => deleteContentMaterial(material)} style={styles.contentCardDelete}>
                                                <Ionicons name="trash-outline" size={20} color="#dc2626" />
                                            </Pressable>
                                        </View>
                                        {themesWithIndex.map(({ theme, lineIndex }) => {
                                            const isEditing = editingContentTheme?.materialId === material.id && editingContentTheme?.lineIndex === lineIndex
                                            const displayTheme = stripThemeBullet(theme)
                                            return (
                                                <View key={`${material.id}-${lineIndex}`} style={styles.contentThemeRow}>
                                                    {isEditing ? (
                                                        <View style={styles.contentThemeEditRow}>
                                                            <TextInput
                                                                style={styles.contentThemeInput}
                                                                value={editContentThemeText}
                                                                onChangeText={setEditContentThemeText}
                                                                onFocus={() => retryKeyboardAwareUpdate(contentModalKeyboardRef)}
                                                                autoFocus
                                                                multiline
                                                            />
                                                            <View style={styles.contentThemeEditActions}>
                                                                <Pressable style={styles.contentThemeCancelBtn} onPress={() => { setEditingContentTheme(null); setEditContentThemeText('') }}>
                                                                    <Ionicons name="close" size={18} color="#64748b" />
                                                                    <Text style={styles.contentThemeCancelText}>キャンセル</Text>
                                                                </Pressable>
                                                                <Pressable style={styles.contentThemeSaveBtn} onPress={saveContentThemeEdit}>
                                                                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                                                                    <Text style={styles.contentThemeSaveText}>保存</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        <View style={styles.contentThemeTextWrap}>
                                                            <Pressable
                                                                style={styles.contentThemeTextPressable}
                                                                onPress={() => {
                                                                    setEditingContentTheme({ materialId: material.id, lineIndex })
                                                                    setEditContentThemeText(displayTheme)
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const flashcard = parseFlashcard(theme)
                                                                    if (flashcard.answer) {
                                                                        return (
                                                                            <View style={{ flex: 1, paddingVertical: 4 }}>
                                                                                <Text style={[styles.contentThemeText, { lineHeight: 22 }]} numberOfLines={2}>
                                                                                    <Text style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: '800', fontSize: 11 }}> Q </Text>
                                                                                    <Text style={{ fontWeight: '700', color: '#1e293b' }}> {flashcard.question}   </Text>
                                                                                    <Text style={{ backgroundColor: '#f0fdf4', color: '#16a34a', fontWeight: '800', fontSize: 11 }}> A </Text>
                                                                                    <Text style={{ fontWeight: '600', color: '#15803d' }}> {flashcard.answer}</Text>
                                                                                </Text>
                                                                            </View>
                                                                        )
                                                                    }
                                                                    return <Text style={styles.contentThemeText} numberOfLines={2}>{displayTheme}</Text>
                                                                })()}
                                                                <Ionicons name="pencil" size={14} color="#94a3b8" />
                                                            </Pressable>
                                                            <Pressable
                                                                onPress={() => deleteContentTheme(material, lineIndex)}
                                                                style={styles.contentThemeIconDelete}
                                                            >
                                                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                                            </Pressable>
                                                        </View>
                                                    )}
                                                </View>
                                            )
                                        })}
                                    </View>
                                )
                            })
                        )}
                    </KeyboardAwareScrollView>
                </KeyboardAvoidingView>
            </Modal>

            {/* 写真の範囲選択（切り取り）モーダル */}
            <Modal
                visible={showCropModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => {
                    setShowCropModal(false)
                    setCropImageUri(null)
                }}
            >
                <View style={styles.cropModalRoot}>
                    {/* 半透明オーバーレイヘッダー（absolute） */}
                    <View style={styles.cropModalHeader}>
                        <View style={styles.cropTitleRow}>
                            <View style={styles.cropTitleBadge}>
                                <Ionicons name="scan-circle-outline" size={16} color="#93c5fd" />
                                <Text style={styles.cropTitleBadgeText}>AI</Text>
                            </View>
                            <Text style={styles.cropModalTitle}>抽出する範囲を選ぼう</Text>
                        </View>
                        <Pressable
                            style={styles.cropModalClose}
                            onPress={() => {
                                setShowCropModal(false)
                                setCropImageUri(null)
                            }}
                            hitSlop={12}
                        >
                            <Ionicons name="close" size={26} color="#e2e8f0" />
                        </Pressable>
                    </View>
                    {/* 画像エリア（ヘッダー分のpadding含む） */}
                    {cropImageUri && (
                        <View
                            style={[styles.cropImageContainer, { paddingTop: Platform.OS === 'ios' ? 120 : 96 }]}
                            onLayout={(e) => setCropContainerLayout(e.nativeEvent.layout)}
                            {...cropPanResponder.panHandlers}
                        >
                            <Image
                                source={{ uri: cropImageUri }}
                                style={styles.cropImage}
                                resizeMode="contain"
                            />
                            {cropContainerLayout.width > 0 && cropContainerLayout.height > 0 && (() => {
                                const { offsetX, offsetY, displayW, displayH } = (() => {
                                    const cw = cropContainerLayout.width
                                    const ch = cropContainerLayout.height
                                    const iw = cropImageWidth || 1
                                    const ih = cropImageHeight || 1
                                    const scale = Math.min(cw / iw, ch / ih)
                                    const dw = iw * scale
                                    const dh = ih * scale
                                    return { offsetX: (cw - dw) / 2, offsetY: (ch - dh) / 2, displayW: dw, displayH: dh }
                                })()
                                const selLeft = offsetX + cropRect.x * displayW
                                const selTop = offsetY + cropRect.y * displayH
                                const selWidth = cropRect.width * displayW
                                const selHeight = cropRect.height * displayH
                                const ch = cropContainerLayout.height
                                const cw = cropContainerLayout.width
                                return (
                                    <>
                                        <View style={[styles.cropDim, { top: 0, left: 0, right: 0, height: selTop }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { bottom: 0, left: 0, right: 0, height: ch - selTop - selHeight }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { left: 0, top: selTop, width: selLeft, height: selHeight }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { right: 0, top: selTop, width: cw - selLeft - selWidth, height: selHeight }]} pointerEvents="none" />
                                        <View
                                            style={[
                                                styles.cropFrame,
                                                { left: selLeft, top: selTop, width: selWidth, height: selHeight },
                                            ]}
                                            pointerEvents="none"
                                        >
                                            <View style={styles.cropCenterCrossV} pointerEvents="none" />
                                            <View style={styles.cropCenterCrossH} pointerEvents="none" />
                                        </View>
                                    </>
                                )
                            })()}
                        </View>
                    )}
                    <View style={styles.cropModalFooter}>
                        <Pressable
                            style={styles.cropSubmitButton}
                            onPress={submitCropAndExtractThemes}
                        >
                            <Text style={styles.cropSubmitButtonText}>この範囲で抽出する</Text>
                            <Ionicons name="sparkles-outline" size={20} color="#fff" />
                        </Pressable>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showCreateModal && !showCropModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => {
                    setShowCreateModal(false)
                    setCreateModalBookLockedId(null)
                }}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>復習カード作成</Text>
                        <Pressable
                            onPress={() => {
                                setShowCreateModal(false)
                                setCreateModalBookLockedId(null)
                            }}
                            style={styles.backButton}
                        >
                            <Text style={styles.backButtonText}>戻る</Text>
                        </Pressable>
                    </View>
                    <KeyboardAwareScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.modalContainer}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                        innerRef={(ref) => { createModalKeyboardRef.current = ref }}
                        onKeyboardWillShow={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                        onKeyboardDidShow={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                        enableOnAndroid
                        extraScrollHeight={120}
                        extraHeight={80}
                        viewIsInsideTabBar
                        keyboardOpeningTime={500}
                        enableResetScrollToCoords={false}
                    >

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>教材選択</Text>
                            {createModalBookLockedId ? (
                                <View style={styles.headerRow}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Text style={styles.mutedText}>
                                            {referenceBooks.find((b) => b.id === createModalBookLockedId)?.name ?? '教材'}
                                        </Text>
                                        <Text style={styles.lockedHintText}>（選択中の教材で追加）</Text>
                                    </View>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.headerRow}>
                                        <Text style={styles.mutedText}>
                                            {selectedBookId
                                                ? referenceBooks.find((b) => b.id === selectedBookId)?.name
                                                : '教材が未選択です'}
                                        </Text>
                                        <Pressable style={styles.outlineButton} onPress={() => setShowBookPicker((prev) => !prev)}>
                                            <Text style={styles.outlineButtonText}>{showBookPicker ? '閉じる' : '教材を選ぶ'}</Text>
                                        </Pressable>
                                    </View>
                                    {showBookPicker && (
                                        <View style={styles.bookPickerArea}>
                                            <View style={styles.bookHeaderRow}>
                                                <Text style={styles.bookHeaderText}>教材リスト</Text>
                                                <Pressable style={styles.addChipButton} onPress={() => setShowAddBookForm((prev) => !prev)}>
                                                    <Ionicons name="add" size={16} color="#334155" />
                                                    <Text style={styles.addChipText}>追加</Text>
                                                </Pressable>
                                            </View>
                                            {showAddBookForm && (
                                                <View style={styles.addCard}>
                                                    <Text style={styles.addCardTitle}>{editingBookId ? '教材を編集' : '新しい教材を追加'}</Text>
                                                    <Text style={styles.inputLabel}>名前</Text>
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="例: チャート式数学I"
                                                        value={newBookName}
                                                        onChangeText={setNewBookName}
                                                        onFocus={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                                                    />
                                                    <Text style={styles.inputLabel}>画像（任意）</Text>
                                                    <Pressable style={styles.imageSelectButton} onPress={openBookImageSourcePicker}>
                                                        {newBookImage ? (
                                                            <Image source={{ uri: newBookImage }} style={{ width: 100, height: 100, borderRadius: 8 }} />
                                                        ) : (
                                                            <Text style={styles.imageSelectText}>画像を選択 / 撮影</Text>
                                                        )}
                                                    </Pressable>
                                                    <View style={styles.modalActions}>
                                                        <Pressable
                                                            style={styles.cancelButton}
                                                            onPress={() => {
                                                                setShowAddBookForm(false)
                                                                setNewBookName('')
                                                                setNewBookImage(null)
                                                                setEditingBookId(null)
                                                            }}
                                                        >
                                                            <Text style={styles.cancelButtonText}>キャンセル</Text>
                                                        </Pressable>
                                                        <Pressable style={styles.submitButton} onPress={handleAddBook}>
                                                            <Text style={styles.submitButtonText}>{editingBookId ? '保存' : '追加'}</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            )}
                                            <View style={styles.bookGrid}>
                                                {referenceBooks.map((book) => (
                                                    <View
                                                        key={book.id}
                                                        style={[
                                                            styles.bookCard,
                                                            selectedBookId === book.id && styles.bookCardActive,
                                                        ]}
                                                    >
                                                        <View style={styles.cardActionRow}>
                                                            <Pressable style={styles.iconButton} onPress={() => {
                                                                setEditingBookId(book.id)
                                                                setNewBookName(book.name)
                                                                setNewBookImage(book.image_url)
                                                                setShowAddBookForm(true)
                                                            }}>
                                                                <Ionicons name="create-outline" size={16} color="#64748b" />
                                                            </Pressable>
                                                            <Pressable style={styles.iconButton} onPress={() => handleDeleteBook(book.id)}>
                                                                <Ionicons name="trash-outline" size={16} color="#64748b" />
                                                            </Pressable>
                                                        </View>
                                                        <Pressable
                                                            style={styles.bookSelectArea}
                                                            onPress={() => {
                                                                setSelectedBookId(book.id)
                                                            }}
                                                        >
                                                            <View style={styles.bookImageBox}>
                                                                {book.image_url ? (
                                                                    <Image source={{ uri: book.image_url }} style={styles.bookImage} />
                                                                ) : (
                                                                    <Ionicons name="book-outline" size={32} color="#94a3b8" />
                                                                )}
                                                            </View>
                                                            <Text style={styles.bookCardText} numberOfLines={2}>{book.name}</Text>
                                                        </Pressable>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>学習日</Text>
                            <Pressable
                                style={styles.dateSelector}
                                onPress={() => setShowDatePicker((prev) => !prev)}
                            >
                                <Ionicons name="calendar-outline" size={20} color="#64748b" />
                                <Text style={styles.dateSelectorText}>
                                    {formatDateLabel(selectedDate)}
                                </Text>
                            </Pressable>
                            {showDatePicker && (
                                Platform.OS === 'ios' ? (
                                    <Modal
                                        transparent={true}
                                        animationType="fade"
                                        visible={showDatePicker}
                                        onRequestClose={() => setShowDatePicker(false)}
                                    >
                                        <View style={styles.datePickerOverlay}>
                                            <View style={styles.datePickerContainer}>
                                                <View style={styles.datePickerHeader}>
                                                    <Pressable onPress={() => setShowDatePicker(false)} style={styles.datePickerCloseButton}>
                                                        <Text style={styles.datePickerCloseText}>完了</Text>
                                                    </Pressable>
                                                </View>
                                                <DateTimePicker
                                                    value={selectedDate}
                                                    mode="date"
                                                    display="spinner"
                                                    locale="ja-JP"
                                                    onChange={(event, date) => {
                                                        if (date) setSelectedDate(date)
                                                    }}
                                                />
                                            </View>
                                        </View>
                                    </Modal>
                                ) : (
                                    <DateTimePicker
                                        value={selectedDate}
                                        mode="date"
                                        display="default"
                                        onChange={(event, date) => {
                                            setShowDatePicker(false)
                                            if (event.type === 'set' && date) {
                                                setSelectedDate(date)
                                            }
                                        }}
                                    />
                                )
                            )}
                        </View>

                        <View style={styles.modeToggle}>
                            <Pressable
                                style={[styles.modeButton, createMode === 'ai' && styles.modeButtonActive]}
                                onPress={() => setCreateMode('ai')}
                            >
                                <Text style={[styles.modeButtonText, createMode === 'ai' && styles.modeButtonTextActive]}>
                                    AIモード
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modeButton, createMode === 'flashcard' && styles.modeButtonActive]}
                                onPress={() => setCreateMode('flashcard')}
                            >
                                <Text style={[styles.modeButtonText, createMode === 'flashcard' && styles.modeButtonTextActive]}>
                                    単語帳モード
                                </Text>
                            </Pressable>
                        </View>

                        {createMode === 'ai' ? (
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionTitle}>AIが問題を自動生成</Text>
                                <Pressable
                                    style={[styles.outlineButton, styles.photoThemeButton]}
                                    onPress={() => {
                                        Alert.alert(
                                            '写真からテーマを抽出',
                                            'カメラで撮影するか、ライブラリから選んでください。',
                                            [
                                                { text: 'キャンセル', style: 'cancel' },
                                                { text: 'カメラ', onPress: () => handlePhotoToThemes(true) },
                                                { text: 'ライブラリ', onPress: () => handlePhotoToThemes(false) },
                                            ]
                                        )
                                    }}
                                    disabled={photoThemeLoading}
                                >
                                    <Ionicons name="camera" size={18} color="#2563eb" />
                                    <Text style={styles.photoThemeButtonText}>
                                        {photoThemeLoading ? '抽出中...' : `写真からテーマを抽出（最大${MAX_THEME_FROM_IMAGE}件）`}
                                    </Text>
                                </Pressable>
                                {aiNotes.map((note, index) => (
                                    <View key={`note-${index}`} style={styles.noteRow}>
                                        <TextInput
                                            style={styles.noteInput}
                                            placeholder="例: 英文法の比較級について"
                                            value={note}
                                            onChangeText={(text) => {
                                                const next = [...aiNotes]
                                                next[index] = text
                                                setAiNotes(next)
                                            }}
                                            onFocus={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                                            multiline
                                        />
                                        <Pressable
                                            style={styles.deleteButton}
                                            onPress={() => {
                                                const next = aiNotes.filter((_, i) => i !== index)
                                                setAiNotes(next.length ? next : [''])
                                            }}
                                        >
                                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                        </Pressable>
                                    </View>
                                ))}
                                <Pressable style={styles.addButton} onPress={() => setAiNotes([...aiNotes, ''])}>
                                    <Ionicons name="add" size={16} color="#2563eb" />
                                    <Text style={styles.addButtonText}>メモを追加</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionTitle}>フラッシュカード</Text>
                                {flashcards.map((card, index) => (
                                    <View key={`card-${index}`} style={styles.flashcardCard}>
                                        <View style={styles.flashcardHeader}>
                                            <Text style={styles.flashcardTitle}>カード {index + 1}</Text>
                                            <Pressable
                                                style={styles.deleteButton}
                                                onPress={() => {
                                                    const next = flashcards.filter((_, i) => i !== index)
                                                    setFlashcards(next.length ? next : [{ question: '', answer: '' }])
                                                }}
                                            >
                                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.flashcardLabel}>問題（表面）</Text>
                                        <TextInput
                                            style={styles.flashcardInput}
                                            placeholder="例: apple"
                                            value={card.question}
                                            onChangeText={(text) => {
                                                const next = [...flashcards]
                                                next[index] = { ...next[index], question: text }
                                                setFlashcards(next)
                                            }}
                                            onFocus={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                                            multiline
                                        />
                                        <Text style={styles.flashcardLabel}>答え（裏面）</Text>
                                        <TextInput
                                            style={[styles.flashcardInput, styles.answerInput]}
                                            placeholder="例: りんご"
                                            value={card.answer}
                                            onChangeText={(text) => {
                                                const next = [...flashcards]
                                                next[index] = { ...next[index], answer: text }
                                                setFlashcards(next)
                                            }}
                                            onFocus={() => retryKeyboardAwareUpdate(createModalKeyboardRef)}
                                            multiline
                                        />
                                    </View>
                                ))}
                                <Pressable style={styles.addButton} onPress={() => setFlashcards([...flashcards, { question: '', answer: '' }])}>
                                    <Ionicons name="add" size={16} color="#2563eb" />
                                    <Text style={styles.addButtonText}>カードを追加</Text>
                                </Pressable>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <Pressable style={styles.submitButton} onPress={handleCreate}>
                                <Text style={styles.submitButtonText}>作成</Text>
                            </Pressable>
                        </View>
                    </KeyboardAwareScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    container: {
        padding: 16,
        backgroundColor: '#f8fafc',
        gap: 12,
        flexGrow: 1,
    },
    card: {
        borderWidth: 1,
        borderColor: '#f1f5f9',
        borderRadius: 24,
        padding: 20,
        backgroundColor: '#ffffff',
        gap: 12,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 4,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0f172a',
        letterSpacing: 0.3,
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#475569',
        marginTop: 4,
    },
    mutedText: {
        fontSize: 12,
        color: '#64748b',
    },
    lockedHintText: {
        fontSize: 11,
        color: '#94a3b8',
        marginLeft: 4,
    },
    outlineButton: {
        borderWidth: 1,
        borderColor: '#bfdbfe',
        backgroundColor: '#eff6ff',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    outlineButtonText: {
        color: '#2563eb',
        fontWeight: '600',
        fontSize: 12,
    },
    askAIButtonInline: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderColor: '#d8b4fe',
        backgroundColor: '#f5f3ff',
    },
    askAIButtonInlineText: {
        color: '#7c3aed',
        fontWeight: '700',
    },

    photoThemeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 10,
        marginTop: 8,
        borderColor: '#93c5fd',
        backgroundColor: '#eff6ff',
    },
    photoThemeButtonText: {
        color: '#2563eb',
        fontWeight: '700',
        fontSize: 14,
    },
    aiOnlyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 4,
        marginBottom: 2,
    },
    aiOnlyChip: {
        fontSize: 11,
        color: '#1d4ed8',
        backgroundColor: '#dbeafe',
        borderColor: '#93c5fd',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        overflow: 'hidden',
        fontWeight: '700',
    },
    taskCard: {
        marginTop: 12,
        gap: 12,
    },
    themeCard: {
        borderWidth: 1,
        borderColor: '#f1f5f9',
        borderRadius: 16,
        padding: 16,
        gap: 8,
        backgroundColor: '#ffffff',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    themeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
        marginTop: 2,
        marginBottom: 4,
    },
    themeBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
        flexShrink: 1,
    },
    themeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    themeTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0f172a',
    },
    quizBlock: {
        gap: 10,
    },
    quizItem: {
        gap: 8,
    },
    quizQuestion: {
        fontSize: 13,
        fontWeight: '600',
    },
    choiceButton: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        padding: 8,
    },
    choiceCorrect: {
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
    },
    choiceWrong: {
        backgroundColor: '#fee2e2',
        borderColor: '#ef4444',
    },
    choiceText: {
        fontSize: 12,
    },
    flashcardButton: {
        backgroundColor: '#dbeafe',
        borderColor: '#3b82f6',
    },
    flashcardButtonText: {
        color: '#1e40af',
    },
    flashcardContainer: {
        marginTop: 8,
        gap: 12,
    },
    flashcardCard: {
        backgroundColor: '#f8fafc',
        borderWidth: 1.5,
        borderColor: '#60a5fa',
        borderRadius: 10,
        padding: 10,
        gap: 6,
    },
    flashcardLabel: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
        textTransform: 'uppercase',
        marginTop: 2,
    },
    answerLabel: {
        color: '#16a34a',
        marginTop: 12,
    },
    flashcardQuestion: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
    },
    flashcardAnswer: {
        fontSize: 15,
        color: '#15803d',
        fontWeight: '500',
    },
    showAnswerButton: {
        backgroundColor: '#dbeafe',
        borderColor: '#3b82f6',
    },
    flashcardActions: {
        flexDirection: 'row',
        gap: 8,
    },
    completeButton: {
        flex: 1,
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
    },
    completeButtonText: {
        color: '#15803d',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    cardHeaderColumn: {
        flexDirection: 'column',
        gap: 12,
    },
    headerTitleWrap: {
        flex: 1,
        minWidth: 100,
        paddingRight: 8,
    },
    headerTitleWrapTop: {
        flex: 0,
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563eb',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 999,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    createButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    modalContainer: {
        padding: 20,
        paddingTop: 0,
        paddingBottom: 300, // Increased for keyboard spacing
        backgroundColor: '#f8fafc',
        flexGrow: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingHorizontal: 20,
        paddingBottom: 16,
        backgroundColor: '#f8fafc',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
    },
    datePickerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    datePickerContainer: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    datePickerCloseButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    datePickerCloseText: {
        color: '#2563eb',
        fontWeight: '700',
        fontSize: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        backgroundColor: '#ffffff',
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#ffffff',
    },
    dateSelectorText: {
        fontSize: 15,
        color: '#0f172a',
    },
    modeToggle: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    modeButtonActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    modeButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    modeButtonTextActive: {
        color: '#ffffff',
    },
    inputSection: {
        gap: 12,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 8,
    },
    noteRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    noteInput: {
        flex: 1,
        borderWidth: 2,
        borderColor: '#3b82f6',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        backgroundColor: '#ffffff',
        minHeight: 70,
        textAlignVertical: 'top',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
    },
    deleteButton: {
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: '#fee2e2',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
    },
    addButtonText: {
        fontSize: 14,
        color: '#2563eb',
        fontWeight: '600',
    },
    flashcardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    flashcardTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1e40af',
    },
    flashcardInput: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 6,
        padding: 8,
        fontSize: 13,
        backgroundColor: '#f8fafc',
        minHeight: 40,
        textAlignVertical: 'top',
    },
    answerInput: {
        backgroundColor: '#fef9e7',
        borderColor: '#f59e0b',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    cancelButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748b',
    },
    submitButton: {
        flex: 1,
        backgroundColor: '#2563eb',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    submitButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
    },
    emptyState: {
        marginTop: 40,
        marginBottom: 20,
        paddingVertical: 50,
        paddingHorizontal: 30,
        alignItems: 'center',
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 20,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 12,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    emptyActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    emptyActionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
    },
    bookPickerArea: {
        marginTop: 12,
        gap: 12,
    },
    bookHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bookHeaderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
    },
    addChipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
    },
    addChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#334155',
    },
    addCard: {
        borderWidth: 2,
        borderColor: '#bfdbfe',
        borderRadius: 12,
        padding: 12,
        backgroundColor: '#f8fafc',
        gap: 8,
        marginBottom: 12,
    },
    addCardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e40af',
        marginBottom: 4,
    },
    imageSelectButton: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#ffffff',
    },
    imageSelectText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
    },
    bookGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    bookCard: {
        width: '48%',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        backgroundColor: '#ffffff',
        position: 'relative',
    },
    bookCardActive: {
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    trashButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        backgroundColor: '#f8fafc',
        padding: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    bookSelectArea: {
        alignItems: 'center',
        gap: 8,
    },
    bookImageBox: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    bookImage: {
        width: 60,
        height: 60,
        resizeMode: 'cover',
    },
    bookCardText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0f172a',
        textAlign: 'center',
    },
    explanationText: {
        fontSize: 14,
        color: '#475569',
        backgroundColor: '#f1f5f9',
        padding: 8,
        borderRadius: 8,
        marginTop: 8,
        lineHeight: 20,
    },
    askAIModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        justifyContent: 'center',
        padding: 16,
    },
    askAIModalCard: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        maxHeight: '90%',
        width: '100%',
        alignSelf: 'center',
        overflow: 'hidden',
    },
    askAIModalScroll: {
        width: '100%',
    },
    askAIModalScrollContent: {
        paddingBottom: 4,
    },
    askAIModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    askAIModalTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#1e293b',
    },
    askAIModalThemeText: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 12,
    },
    askAIModalLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 6,
    },
    askAIModalInput: {
        minHeight: 100,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 10,
        fontSize: 14,
        color: '#0f172a',
        backgroundColor: '#f8fafc',
    },
    askAIModalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 12,
    },
    askAISecondaryButton: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    askAISecondaryButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    askAIPrimaryButton: {
        backgroundColor: '#7c3aed',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    askAIPrimaryButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#ffffff',
    },
    askAILoadingWrap: {
        alignItems: 'center',
        marginTop: 10,
    },
    askAIAnswerCard: {
        marginTop: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        maxHeight: 380,
        minHeight: 180,
        overflow: 'hidden',
    },
    askAIAnswerScroll: {
        maxHeight: 320,
    },
    askAIAnswerLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        marginBottom: 6,
    },
    askAIAnswerText: {
        fontSize: 14,
        color: '#1e293b',
        lineHeight: 20,
        flexShrink: 1,
    },
    askAIAnswerHint: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 8,
    },
    subjectList: {
        gap: 12,
        marginTop: 12,
    },
    subjectCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    subjectCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    subjectIconBox: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    subjectImage: {
        width: 48,
        height: 48,
        resizeMode: 'cover',
    },
    subjectTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 4,
    },
    badgeRow: {
        flexDirection: 'row',
    },
    cnadge: {
        backgroundColor: '#dbeafe',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#bfdbfe',
    },
    cnadgeText: {
        fontSize: 12,
        color: '#1d4ed8',
        fontWeight: '700',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    backButtonText: {
        color: '#64748b',
        fontWeight: '600',
        fontSize: 13,
    },
    cardActionRow: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        gap: 8,
        zIndex: 10,
    },
    iconButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
    },
    // SM-2 rating buttons
    perfectButton: {
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
        flex: 1,
    },
    perfectButtonText: {
        color: '#15803d',
        fontWeight: '700',
    },
    goodButton: {
        backgroundColor: '#fef9c3',
        borderColor: '#eab308',
        flex: 1,
    },
    goodButtonText: {
        color: '#a16207',
        fontWeight: '700',
    },
    hardButton: {
        backgroundColor: '#fee2e2',
        borderColor: '#ef4444',
        flex: 1,
    },
    hardButtonText: {
        color: '#b91c1c',
        fontWeight: '700',
    },
    dontKnowButton: {
        backgroundColor: '#f1f5f9',
        borderColor: '#94a3b8',
        marginTop: 4,
    },
    dontKnowButtonText: {
        color: '#475569',
        fontWeight: '700',
    },
    editThemeButton: {
        backgroundColor: '#fefce8',
        borderColor: '#fbbf24',
        marginTop: 4,
    },
    editThemeButtonText: {
        color: '#92400e',
        fontWeight: '700',
    },
    editThemeContainer: {
        marginTop: 8,
        gap: 8,
        backgroundColor: '#fefce8',
        borderWidth: 1,
        borderColor: '#fbbf24',
        borderRadius: 10,
        padding: 10,
    },
    editThemeInput: {
        borderWidth: 1,
        borderColor: '#fbbf24',
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        backgroundColor: '#ffffff',
        minHeight: 60,
        textAlignVertical: 'top',
    },
    editThemeActions: {
        flexDirection: 'row',
        gap: 8,
    },
    editThemeCancelButton: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        borderColor: '#94a3b8',
    },
    editThemeSubmitButton: {
        flex: 2,
        backgroundColor: '#fef9c3',
        borderColor: '#eab308',
    },
    editThemeSubmitText: {
        color: '#713f12',
        fontWeight: '700',
    },
    cropModalRoot: {
        flex: 1,
        backgroundColor: '#020617',
    },
    cropModalHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 62 : 30,
        paddingBottom: 14,
        backgroundColor: 'rgba(2,6,23,0.68)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(96,165,250,0.28)',
    },
    cropTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    cropTitleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: 'rgba(147,197,253,0.5)',
        backgroundColor: 'rgba(37,99,235,0.28)',
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    cropTitleBadgeText: {
        fontSize: 11,
        color: '#bfdbfe',
        fontWeight: '700',
    },
    cropModalClose: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropModalTitle: {
        fontSize: 24,
        color: '#eff6ff',
        fontWeight: '800',
        letterSpacing: 0.7,
    },
    cropModalSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },
    cropModalHeaderRight: {
        width: 40,
    },
    cropImageContainer: {
        flex: 1,
        position: 'relative',
    },
    cropImage: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: undefined,
        height: undefined,
    },
    cropDim: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    cropFrame: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#3b82f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropCenterCrossV: {
        width: 2,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    cropCenterCrossH: {
        position: 'absolute',
        width: 20,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    cropModalFooter: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 38 : 20,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    cropModalFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    cropRetakeButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
    },
    cropRetakeButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    cropSubmitButton: {
        backgroundColor: '#3b82f6',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 8,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 6,
    },
    cropSubmitButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    themeHeaderRight: {
        alignItems: 'flex-end',
        gap: 4,
    },
    overdueBadge: {
        backgroundColor: '#fff3e0',
        borderWidth: 1,
        borderColor: '#f97316',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    overdueBadgeText: {
        fontSize: 11,
        color: '#ea580c',
        fontWeight: '600',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    contentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    contentButtonText: {
        color: '#475569',
        fontSize: 13,
        fontWeight: '700',
    },
    futureButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#bfdbfe',
    },
    futureButtonText: {
        color: '#2563eb',
        fontSize: 13,
        fontWeight: '700',
    },
    bulkQuizButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#7c3aed',
        backgroundColor: '#f5f3ff',
        marginBottom: 12,
    },
    bulkQuizIconWrap: {
        backgroundColor: '#ede9fe',
        padding: 6,
        borderRadius: 10,
    },
    bulkQuizText: {
        color: '#5b21b6',
        fontSize: 14,
        fontWeight: '700',
    },
    contentModalRoot: {
        flex: 1,
        backgroundColor: '#f1f5f9',
    },
    contentModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 56 : 20,
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    contentModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
    },
    contentModalClose: {
        padding: 4,
    },
    contentModalBody: {
        flex: 1,
    },
    contentModalBodyContent: {
        padding: 16,
        paddingBottom: 40,
    },
    contentEmptyState: {
        alignItems: 'center',
        paddingTop: 60,
        gap: 10,
    },
    contentEmptyText: {
        fontSize: 16,
        color: '#64748b',
        fontWeight: '500',
    },
    contentEmptySubtext: {
        fontSize: 14,
        color: '#94a3b8',
    },
    contentCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    contentCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },
    contentCardDate: {
        fontSize: 13,
        color: '#64748b',
        minWidth: 64,
    },
    contentCardSubject: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#334155',
    },
    contentCardDelete: {
        padding: 6,
    },
    contentThemeRow: {
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 8,
    },
    contentThemeEditRow: {
        width: '100%',
    },
    contentThemeTextWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        flex: 1,
        gap: 6,
    },
    contentThemeTextPressable: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    contentThemeText: {
        flex: 1,
        fontSize: 14,
        color: '#1e293b',
        lineHeight: 20,
    },
    contentThemeIconEdit: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 'auto',
    },
    contentThemeIconDelete: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#fef2f2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentThemeInput: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        backgroundColor: '#ffffff',
        minHeight: 60,
        textAlignVertical: 'top',
    },
    contentThemeEditActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    contentThemeSaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
        marginLeft: 12,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    contentThemeSaveText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 14,
        marginLeft: 6,
    },
    contentThemeCancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    contentThemeCancelText: {
        color: '#64748b',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 6,
    },
    futureModalRoot: {
        flex: 1,
        backgroundColor: '#f1f5f9',
    },
    futureModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 56 : 20,
        paddingHorizontal: 20,
        paddingBottom: 18,
    },
    futureModalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    futureModalTitleIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    futureModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1e293b',
        letterSpacing: 0.3,
    },
    futureModalCloseButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    futureModalBody: {
        flex: 1,
    },
    futureModalBodyContent: {
        paddingHorizontal: 16,
        paddingTop: 0,
        paddingBottom: 40,
    },
    futureEmptyState: {
        alignItems: 'center',
        paddingTop: 72,
        gap: 14,
    },
    futureEmptyIconWrap: {
        opacity: 0.9,
    },
    futureEmptyText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#64748b',
    },
    futureEmptySubtext: {
        fontSize: 14,
        color: '#94a3b8',
    },
    historyPremiumRoot: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    historyPremiumHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 24,
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    historyPremiumTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    historyPremiumTitleIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#ecfdf5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyPremiumTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0f172a',
        letterSpacing: 0.3,
    },
    historyPremiumHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    historyPremiumRefreshBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f8fafc',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyPremiumCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f8fafc',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyTabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    historyTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
    },
    historyTabActive: {
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#bfdbfe',
    },
    historyTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    historyTabTextActive: {
        color: '#2563eb',
        fontWeight: '700',
    },
    historyPremiumBody: {
        flex: 1,
    },
    historyPremiumBodyContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 40,
    },
    historyPremiumErrorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fef2f2',
        borderWidth: 1,
        borderColor: '#fecaca',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
    },
    historyPremiumErrorText: {
        flex: 1,
        color: '#b91c1c',
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
    },
    historyPremiumEmptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    historyPremiumEmptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    historyPremiumEmptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 8,
    },
    historyPremiumEmptySubtext: {
        fontSize: 14,
        color: '#94a3b8',
    },
    historyPremiumCard: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    historyPremiumCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    historyPremiumDate: {
        fontSize: 13,
        color: '#64748b',
        fontWeight: '700',
    },
    historyPremiumSubjectBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    historyPremiumSubjectText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#475569',
    },
    historyPremiumTheme: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0f172a',
        lineHeight: 24,
    },
    historyTrendMetaRow: {
        marginTop: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    historyTrendMetaText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    historyPremiumDivider: {
        height: 1,
        backgroundColor: '#f1f5f9',
        marginVertical: 12,
    },
    historyRetentionSection: {
        marginBottom: 14,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
    },
    historyRetentionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    historyRetentionTitle: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '700',
    },
    historyRetentionPercent: {
        fontSize: 15,
        fontWeight: '800',
    },
    historyRetentionTrack: {
        height: 9,
        borderRadius: 999,
        backgroundColor: '#e2e8f0',
        overflow: 'hidden',
    },
    historyRetentionFill: {
        height: '100%',
        borderRadius: 999,
    },
    historyRetentionCaption: {
        marginTop: 8,
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    historyTrendScrollContent: {
        alignItems: 'center',
        paddingBottom: 4,
        paddingRight: 8,
    },
    historyTrendStep: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 2,
    },
    historyTrendChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 6,
    },
    historyTrendChipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    historyTrendChipDate: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '600',
    },
    historyTrendArrow: {
        marginHorizontal: 4,
    },
    historyPremiumQuestion: {
        fontSize: 15,
        fontWeight: '600',
        color: '#334155',
        lineHeight: 22,
        marginBottom: 14,
    },
    historyMoreButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#e0f2fe',
    },
    historyMoreButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0369a1',
    },
    historyAttemptsList: {
        marginTop: 12,
        gap: 10,
    },
    historyAttemptItem: {
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        gap: 4,
    },
    historyAttemptTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    historyAttemptQuestion: {
        fontSize: 14,
        color: '#0f172a',
        lineHeight: 20,
    },
    historyAttemptChoices: {
        marginTop: 4,
        gap: 6,
    },
    historyAttemptExplanation: {
        marginTop: 4,
        fontSize: 13,
        color: '#4b5563',
        lineHeight: 19,
    },
    historyPremiumChoices: {
        gap: 8,
        marginBottom: 16,
    },
    historyPremiumChoice: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    historyPremiumChoiceCorrect: {
        backgroundColor: '#f0fdf4',
        borderColor: '#16a34a',
    },
    historyPremiumChoiceWrong: {
        backgroundColor: '#fef2f2',
        borderColor: '#ef4444',
    },
    historyPremiumChoiceText: {
        flex: 1,
        fontSize: 14,
        color: '#475569',
        lineHeight: 20,
    },
    historyPremiumResultBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
    },
    resultBannerCorrect: {
        backgroundColor: '#f0fdf4',
    },
    resultBannerWrong: {
        backgroundColor: '#fef2f2',
    },
    historyPremiumResultText: {
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 6,
    },
    historyPremiumExplanationBox: {
        marginTop: 12,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        padding: 12,
    },
    historyPremiumExplanationLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#64748b',
        marginBottom: 4,
    },
    historyPremiumExplanationText: {
        fontSize: 14,
        color: '#334155',
        lineHeight: 20,
    },
    historyQASection: {
        marginTop: 4,
        gap: 8,
    },
    historyQAItem: {
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    historyQAMeta: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 6,
    },
    historyQAQuestion: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1e293b',
        lineHeight: 19,
    },
    historyQAAnswer: {
        fontSize: 13,
        color: '#334155',
        lineHeight: 19,
        marginTop: 4,
    },
    // Flashcard styles
    historyPremiumFlashcardQA: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    historyPremiumFlashcardRow: {
        flexDirection: 'row',
        gap: 12,
    },
    historyPremiumQABadge: {
        width: 24,
        height: 24,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    historyPremiumQABadgeText: {
        fontSize: 13,
        fontWeight: '800',
    },
    historyPremiumFlashcardQText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
        lineHeight: 22,
    },
    historyPremiumFlashcardAText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#475569',
        lineHeight: 22,
    },
    historyPremiumRatingFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
    },
    historyPremiumRatingLabel: {
        fontSize: 13,
        color: '#64748b',
        fontWeight: '600',
    },
    historyPremiumRatingBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
    },
    historyPremiumRatingText: {
        fontSize: 12,
        fontWeight: '800',
    },
    futureDateGroup: {
        marginBottom: 16,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        overflow: 'hidden',
    },
    futureDateHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    futureDateHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    futureDateLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
    },
    futureCountBadge: {
        backgroundColor: '#dbeafe',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    futureCountText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    futureThemeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    futureThemeRowFirst: {
        borderTopWidth: 0,
    },
    futureSubjectText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
        minWidth: 56,
        maxWidth: 80,
    },
    futureThemeText: {
        fontSize: 14,
        color: '#334155',
        flex: 1,
        lineHeight: 20,
    },
    futureStudyDateText: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 3,
    },
    historyFilterBar: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexWrap: 'wrap',
    },
    historyFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
    },
    historyFilterChipActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    historyFilterChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
    },
    historyFilterChipTextActive: {
        color: '#ffffff',
    },
})
