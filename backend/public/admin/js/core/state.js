// modules/state.js — Global state variables (loaded first)

// ===================================
// GLOBAL CONFIG
// ===================================
const API_URL = 'http://localhost:5000/api';

// ===================================
// AUTH STATE
// ===================================
let currentUser = null;
let authToken = null;

// ===================================
// USER STATE
// ===================================
let isEditMode = false;

// ===================================
// VOCABULARY STATE
// ===================================
let vocabCurrentPage = 1;
const vocabCurrentLimit = 50;
let vocabCurrentPart = '';
let vocabCurrentSource = '';
let vocabCurrentType = '';
let vocabSearchTerm = '';
let vocabCurrentLang = 'en';

// ===================================
// OFFLINE / FALLBACK MODE STATE
// ===================================
let isOfflineMode = false;
let localVocabularyData = []; // Cache for local JSON data
let currentLocalFile = 'vocabulary.json';
let dashboardInitialized = false; // Guard to prevent multiple initializations
let searchHandlerRegistered = false; // Guard to prevent duplicate search handler

// ===================================
// VOCAB FILE SWITCHER STATE
// ===================================
let currentVocabFile = 'vocabulary.json';

// ===================================
// QUICK DELETE STATE
// ===================================
let quickDeleteData = {
    allWords: [],
    currentIndex: 0,
    isRunning: false,
    deletedCount: 0,
};

// ===================================
// TOEIC STATE
// ===================================
const TOEIC_API_BASE = '/api/toeic';
let currentQuestions = [];
let allQuestions = []; // Store all questions for filtering
let currentTests = [];
let allTests = []; // Store all tests for filtering
let currentUsers = [];
let allUsers = []; // Store all users for filtering
let lastSelectedPart = null; // Remember last selected part for quick adding
let currentImageUrls = []; // Ảnh của câu đang sửa (hỗ trợ nhiều ảnh — Part 1/3/4/6/7)

// Highlight state tracking
let highlightedQuestionId = null; // Currently highlighted question
let previouslyViewedQuestionIds = new Set(); // Previously viewed questions

// Search & Filter state
let searchFilters = {
    searchText: '',
    part: '',
    source: '',
    sortBy: 'newest'
};

let userFilters = {
    searchText: '',
    role: '',
    status: ''
};

let testFilters = {
    searchText: '',
    type: '',
    level: '',
    sortBy: 'newest'
};

// Pagination state
let questionsPagination = {
    currentPage: 1,
    totalPages: 1,
    limit: 15,
    total: 0,
    filterPart: ''
};

let testsPagination = {
    currentPage: 1,
    totalPages: 1,
    limit: 15,
    total: 0
};

let usersPagination = {
    currentPage: 1,
    totalPages: 1,
    limit: 15,
    total: 0
};

// ===================================
// REPORTS STATE
// ===================================
let reportsPage = 1;
const reportsLimit = 20;

// ===================================
// PRACTICE HISTORY STATE
// ===================================
let practiceHistoryData = [];
let practiceHistoryPage = 1;
const practiceHistoryLimit = 20;

// ===================================
// MONITOR STATE
// ===================================
let metricsPollingTimer = null;

// ===================================
// USER STATS STATE
// ===================================
let usPage = 1;
let usSearch = '';

// ===================================
// USER ACHIEVEMENTS STATE
// ===================================
let _uaPage = 1;
let _uaSearch = '';
let _uaSearchTimer = null;
let _uaAutoExpandId = null;

// ===================================
// PRACTICE HISTORY 12 MODES STATE
// ===================================
let phPage = 1;

// ===================================
// BROADCAST STATE
// ===================================
let _bcSearchTimer = null;
