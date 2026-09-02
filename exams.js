import { learnedExams } from "./exams-learned.js";

// The hand-maintained answer bank. Everything below is written by a person; the
// answers a run's grading confirms are kept separately, in exams-learned.js,
// and merged in at the bottom of this file. Keeping them apart means a run can
// record what it learned without ever rewriting the entries below it.
const authored = {
  "apple-at-work-basics": {
    name: "Apple at Work Basics",
    questions: [
      {
        type: "multiple",
        match: "מה כדאי לכם לספר ללקוחות בנוגע לגישה המקיפה של Apple לאבטחה",
        answers: [
          "מאפייני הפרטיות של Apple מופעלים כברירת מחדל",
          "Apple מפתחת מוצרים עם חומרה, תוכנה ושירותים משולבים"
        ]
      },
      {
        type: "multiple",
        match: "אילו מהיישומים ומהפתרונות הבאים של חברות צד שלישי תואמים למכשירי Apple",
        answers: [
          "Google Workspace",
          "פתרונות VPN של Cisco",
          "Microsoft Exchange"
        ]
      },
      {
        type: "single",
        match: "Apple מחוללת שינוי בענפי תעשייה",
        answer: "נכון"
      },
      {
        type: "single",
        match: "אנשים רבים כבר משתמשים במכשירי Apple בחייהם האישיים",
        answer: "נכון"
      },
      {
        type: "multiple",
        match: "מהן הסיבות העיקריות לכך שמשתלם להשתמש במוצרי Apple לעבודה",
        answers: [
          "עמידות",
          "ערך שיורי גבוה",
          "אפשרויות רכישה גמישות וחסכוניות"
        ]
      },
      {
        type: "single",
        match: "השירותים ש-Apple מציעה לארגונים מוגבלים",
        answer: "לא נכון"
      },
      {
        type: "single",
        match: "Apple Business ופתרון ניהול מכשירים",
        answer: "נכון"
      },
      {
        type: "multiple",
        match: "מדוע כדאי לשוחח עם הלקוחות על מוצרי Apple",
        answers: [
          "מכשירי Apple תוכננו לספק תאימות",
          "מוצרי Apple מסייעים לאנשים לעמוד בדרישות העבודה שלהם",
          "מוצרי Apple מהווים השקעה חכמה"
        ]
      },
      {
        type: "selects",
        match: "התאימו את המאפיין לתיאור שלו",
        answers: [
          "נגישות מובנית",
          "Apple Silicon",
          "המשכיות"
        ]
      },
      {
        type: "single",
        match: "עם פלטפורמת המפתחים של Apple",
        answer: "נכון"
      }
    ]
  },
  "mac-basics": {
    name: "בוחן – יסודות ה-Mac",
    questions: [
      {
        type: "multiple",
        match: "אילו ערכי ליבה Apple משלבת בכל המוצרים שלה",
        answers: ["פרטיות", "הכללה וגיוון", "נגישות"]
      },
      {
        type: "multiple",
        match: "אילו מבין היישומים המובנים הבאים כלולים בכל Mac",
        answers: ["Numbers", "לוח שנה", "Keynote"]
      },
      {
        type: "single",
        match: "Microsoft 365 זמין",
        answer: "נכון"
      },
      {
        type: "multiple",
        match: "מה תוכלו לספר ללקוחות על התכונות",
        answers: [
          "לשתף באופן אלחוטי",
          "Apple Watch",
          "לסרוק מסמך באמצעות iPhone"
        ]
      },
      {
        type: "multiple",
        match: "אילו תכונות של Mac פועלות יחד עם iPad",
        answers: ["Sidecar", "שליטה אוניברסלית", "תזכורות"]
      }
    ]
  },
  "ipad-basics": {
    name: "בוחן – התכונות הבסיסיות של iPad",
    questions: [
      {
        type: "selects",
        match: "חברת בנייה מעוניינת לדעת כיצד עובדיה יוכלו לבצע משימות",
        answers: ["קבצים", "AirDrop", "AirPlay"]
      },
      {
        type: "multiple",
        match: "להפיג את החששות של הלקוחות לגבי עלויות התמיכה של עדכוני תוכנה",
        answers: [
          "קל להתקין עדכוני תוכנה בכל מכשיר",
          "עדכוני תוכנה תואמים גם למכשירים חדשים וגם למכשירים ישנים יותר",
          "עדכוני התוכנה ניתנים בחינם ומגיעים ישירות מ-Apple"
        ]
      },
      {
        type: "multiple",
        match: "אילו מהשירותים הבאים מציעה Apple לארגונים",
        answers: [
          "פתיחת אריזה של מכשיר והגדרה באתר",
          "מחלקת תמיכה",
          "Apple Business Manager"
        ]
      },
      {
        type: "multiple",
        match: "אילו מהתכונות הבאות של iPad עוזרות ללקוחות בריבוי משימות",
        answers: ["Split View", "Slide Over"]
      },
      {
        type: "multiple",
        match: "מה הופך את ה-iPad למכשיר עוצמתי ויעיל עבור ארגונים",
        answers: ["חיי סוללה שמספיקים לכל היום", "Apple Silicon", "אבטחה מובנית"]
      }
    ]
  },
  "iphone-basics": {
    name: "בוחן – התכונות הבסיסיות של iPhone",
    questions: [
      {
        type: "multiple",
        match: "אילו ערכי ליבה Apple משלבת בכל המוצרים שלה",
        answers: ["סביבה", "פרטיות", "נגישות"]
      },
      {
        type: "single",
        match: "הנתונים מעובדים במכשירי Apple עצמם",
        answer: "נכון"
      },
      {
        type: "multiple",
        match: "אילו יישומים יכולים לעזור לארגונים לשנות את אופן העבודה",
        answers: ["יישומים ב-App Store", "יישומים מובנים", "יישומים מותאמים אישית"]
      },
      {
        type: "multiple",
        match: "איך אפשר להשתמש במכשירי iPhone כדי לשפר תפעול של מסעדה",
        answers: ["בטיחות מזון", "ניהול משימות", "נקודת מכירה ניידת"]
      },
      {
        type: "selects",
        match: "התאימו את תכונת הנגישות של Apple לתיאור שלה",
        answers: ["זכוכית מגדלת", "האזנה בזמן אמת", "מצב קריאה של Safari"]
      }
    ]
  },
  "construction-is-modernising": {
    name: "Construction is modernising",
    questions: [
      {
        type: "single",
        match: "Since 1945, productivity in retail, manufacturing and agriculture",
        answer: "0 per cent"
      },
      {
        type: "multiple",
        match: "What are the three trends that are transforming construction businesses",
        answers: [
          "More complex projects",
          "Hiring – and keeping – good people",
          "Virtual design and construction"
        ]
      },
      {
        type: "single",
        match: "What is a digital twin",
        answer: "A virtual model that collects real-world information"
      },
      {
        type: "single",
        match: "32 per cent of construction executives say that staffing shortages",
        answer: "False"
      },
      {
        type: "single",
        match: "who is the frontline leader who is usually the key point of contact",
        answer: "Supervisor"
      }
    ]
  },
  "financial-services-is-modernising": {
    name: "Financial services is modernising",
    questions: [
      {
        type: "multiple",
        match: "Which of these are major trends affecting the financial services industry",
        answers: [
          "Rebalancing the workforce",
          "Increasing competition",
          "Accelerating digital transformation"
        ]
      },
      {
        type: "single",
        match: "Which financial services role prepares and evaluates financial documents",
        answer: "Accountant"
      },
      {
        type: "single",
        match: "What does a personal financial advisor do",
        answer: "Monitors the activities of selected accounts"
      },
      {
        type: "single",
        match: "Which financial services leader is central to financial institutions' efforts to digitise internal operations",
        answer: "Chief digital officer (CDO)"
      },
      {
        type: "single",
        match: "Which Apple tool enables customers to remotely set up, configure and manage",
        answer: "Apple Business Manager"
      }
    ]
  },
  "insurance-is-modernising": {
    name: "Insurance is modernising",
    questions: [
      {
        type: "multiple",
        match: "What are the major trends that are impacting the insurance industry",
        answers: [
          "Changing customer needs",
          "Hiring – and keeping – good people",
          "Technology-driven field service"
        ]
      },
      {
        type: "single",
        match: "what percentage of millennials are interested in working in the insurance industry",
        answer: "4 per cent"
      },
      {
        type: "single",
        match: "most useful in discovering opportunities to optimise a customer's processes",
        answer: "What processes do you still perform using pen and paper?"
      },
      {
        type: "single",
        match: "Which insurance role uses mathematics, statistics and financial theories",
        answer: "Actuary"
      },
      {
        type: "multiple",
        match: "What tasks are typically performed by an insurance agent",
        answers: [
          "Developing relationships with prospective clients",
          "Marketing to consumers through social media",
          "Selling and negotiating insurance policies"
        ]
      }
    ]
  },
  "manufacturing-is-modernising": {
    name: "Manufacturing is modernising",
    questions: [
      {
        type: "single",
        match: "According to an article in Forbes magazine, what percentage of every dollar",
        answer: "20"
      },
      {
        type: "multiple",
        match: "Which of these is an Apple differentiator you can talk about with customers in manufacturing",
        answers: [
          "Ease of use",
          "Powerful hardware",
          "Secure platform for essential data",
          "Extensive accessory ecosystem",
          "Inherently mobile"
        ]
      },
      {
        type: "multiple",
        match: "major trends that are affecting manufacturing performance, productivity and efficiency",
        answers: [
          "Connected machines",
          "Work complexity",
          "Hiring – and keeping – good people",
          "Regulatory complexity"
        ]
      },
      {
        type: "single",
        match: "What is GMP",
        answer: "Good Manufacturing Practices"
      },
      {
        type: "multiple",
        match: "Which industries are the most common targets of ransomware attacks",
        answers: ["Healthcare", "Manufacturing"]
      }
    ]
  },
  "restaurants-are-modernising": {
    name: "Restaurants are modernising",
    questions: [
      {
        type: "multiple",
        match: "Which of the following are challenges facing restaurant managers",
        answers: [
          "Staffing and scheduling issues",
          "Improving business performance",
          "Legacy technology that forces them to manage tasks manually"
        ]
      },
      {
        type: "multiple",
        match: "How do restaurant operators adapt to changing customer preferences",
        answers: [
          "They monitor changes in consumer attitudes.",
          "They invest heavily in research.",
          "They invest in menu development efforts."
        ]
      },
      {
        type: "multiple",
        match: "discovery questions related to a restaurant’s technology and platforms",
        answers: [
          "How do you use mobile devices and apps to increase sales",
          "What tasks take your frontline workers the longest to complete?",
          "What are customers’ and workers’ biggest frustrations with your current technology?"
        ]
      },
      {
        type: "multiple",
        match: "competitors for the money that customers have traditionally spent on dining in a restaurant",
        answers: [
          "Home-delivered meal kit services",
          "Ghost kitchens",
          "Supermarket hot food bars and meal kits"
        ]
      },
      {
        type: "single",
        match: "Bearing the needs and perspectives of frontline workers in mind",
        answer: "True"
      }
    ]
  },
  "retail-is-modernising": {
    name: "Retail is modernising",
    questions: [
      {
        type: "multiple",
        match: "What are the trends driving growth and constant change in retail categories today",
        answers: [
          "Employee retention and turnover",
          "Personalisation",
          "Online convergence",
          "Self-service",
          "Connected shoppers"
        ]
      },
      {
        type: "single",
        match: "Omnichannel retail is a combination of distribution methods",
        answer: "True"
      },
      {
        type: "multiple",
        match: "What makes Apple devices the perfect fit for the retail industry",
        answers: ["Ease of use", "Powerful hardware", "Robust partner ecosystem"]
      },
      {
        type: "single",
        match: "focuses on building relationships, and uses data to serve and market to customers",
        answer: "Head of customer experience"
      },
      {
        type: "single",
        match: "responsible for the performance of employees and local sales results",
        answer: "Store manager"
      }
    ]
  },
  "field-sales-is-modernising": {
    name: "Field sales is modernising",
    questions: [
      {
        type: "multiple",
        match: "key performance indicators (KPIs) that can help you to evaluate the performance of a sales team",
        answers: [
          "Customer satisfaction (CSAT)",
          "Customer retention/attrition",
          "Customer lifetime value",
          "Pipeline accuracy"
        ]
      },
      {
        type: "single",
        match: "According to IDC, how many decision-makers are involved",
        answer: "Eight"
      },
      {
        type: "multiple",
        match: "top three priorities of chief sales officers today",
        answers: [
          "Sales manager effectiveness",
          "Prospecting and early pipeline activities",
          "Growing accounts"
        ]
      },
      {
        type: "single",
        match: "How much did customer service reps increase BSH revenues",
        answer: "20 per cent"
      },
      {
        type: "multiple",
        match: "Which trends are reshaping the field sales line of business",
        answers: ["Strategic sales enablement", "Greater customer expectations", "More complexity"]
      }
    ]
  },
  "field-service-is-modernising": {
    name: "Field service is modernising",
    questions: [
      {
        type: "single",
        match: "Field service is a line of business",
        answer: "True"
      },
      {
        type: "multiple",
        match: "three trends impacting field service lines of business where Apple can help",
        answers: [
          "Connected machines",
          "Work complexity",
          "Recruiting, retention and training"
        ]
      },
      {
        type: "multiple",
        match: "identify an opportunity to help a field service customer optimise their processes",
        answers: [
          "How have the company's field roles changed over the past five years?",
          "What jobs does this customer struggle to fill?",
          "What processes are they still performing with paper?",
          "If the customer is collecting data, how are they aggregating and evaluating it"
        ]
      },
      {
        type: "single",
        match: "automatically pulling GPS data, collecting video or audio data",
        answer: "True"
      },
      {
        type: "single",
        match: "aligns employee roles, programmes and technology to achieve objectives",
        answer: "Head of innovation or transformation"
      }
    ]
  },
  "it-is-modernising": {
    name: "IT is modernising",
    questions: [
      {
        type: "single",
        match: "According to Box co-founder and CEO Aaron Levie",
        answer: "Transforming business"
      },
      {
        type: "multiple",
        match: "trends that are impacting IT lines of business today",
        answers: [
          "Edge computing",
          "Augmented reality and virtual reality",
          "Hyperautomation",
          "Hybrid cloud computing"
        ]
      },
      {
        type: "single",
        match: "Hybrid cloud computing combines which two technologies",
        answer: "Public clouds and private clouds"
      },
      {
        type: "multiple",
        match: "Which of the following are focus areas for a CIO/CTO",
        answers: [
          "Streamlining operations through technology",
          "Developing technical systems to improve customer satisfaction",
          "Negotiating contracts with suppliers and service providers"
        ]
      },
      {
        type: "multiple",
        match: "What features of Apple devices make them the best choice for IT",
        answers: [
          "Streamlined deployment and management",
          "Built-in enterprise-grade security",
          "Powerful enterprise partnerships"
        ]
      }
    ]
  },
  "training-is-modernising": {
    name: "Training is modernising",
    questions: [
      {
        type: "single",
        match: "which role identifies performance, skill, knowledge, information and attitude gaps",
        answer: "Instructional designer"
      },
      {
        type: "multiple",
        match: "three trends impacting the training line of business where Apple can help",
        answers: [
          "E-learning revolution",
          "Training at the point of need",
          "Self-directed learning"
        ]
      },
      {
        type: "single",
        match: "Creating content for a constantly changing landscape of learning management systems",
        answer: "True"
      },
      {
        type: "single",
        match: "understand more about how your training customer could optimise processes",
        answer: "How do you store and distribute training content today?"
      },
      {
        type: "single",
        match: "What Apple technology lets trainers share videos, photos, music and more",
        answer: "AirPlay"
      }
    ]
  },
  "warehousing-and-logistics-is-modernising": {
    name: "Warehousing and logistics is modernising",
    questions: [
      {
        type: "single",
        match: "Every organisation manages some form of logistics",
        answer: "True"
      },
      {
        type: "multiple",
        match: "what tasks are performed in a typical warehouse",
        answers: ["Labelling goods", "Storing goods", "Packaging goods"]
      },
      {
        type: "multiple",
        match: "major trends that are affecting the warehousing and logistics industry",
        answers: [
          "Increasingly complex processes",
          "Attracting and keeping a strong workforce",
          "Limited operational visibility",
          "The rise of third-party logistics"
        ]
      },
      {
        type: "single",
        match: "responsible for compliance with government regulations and adherence to safety guidelines",
        answer: "Chief operations officer"
      },
      {
        type: "single",
        match: "How much money did PepsiCo save in the first year",
        answer: "US$3.4 million"
      }
    ]
  },
  "help-sellers-become-trusted-advisers": {
    name: "Help sellers become trusted advisers",
    questions: [
      {
        type: "multiple",
        match: "What challenges can an assisted selling solution help a business overcome",
        answers: [
          "Time-consuming busywork",
          "Dependence on in-person sales meetings",
          "Limited access to key documents and product information"
        ]
      },
      {
        type: "multiple",
        match: "identify an opportunity to recommend an assisted selling solution",
        answers: [
          "Does your business ever lose sales because team members have poor knowledge",
          "Have your sales teams raised issues about time spent on administrative workflows or data entry?",
          "How long does it take your sales representatives to send prospective clients a meeting summary with recommendations?"
        ]
      },
      {
        type: "multiple",
        match: "industries that could benefit from implementing an assisted selling solution",
        answers: ["Property", "Financial services", "Car sales"]
      },
      {
        type: "multiple",
        match: "common objections of organisations that may benefit from implementing an assisted selling solution",
        answers: [
          "A new sales tool will disrupt workflows.",
          "Mobility isn’t a priority.",
          "An assisted selling solution isn’t a priority."
        ]
      },
      {
        type: "single",
        match: "familiar actions, such as swiping, scrolling and tapping",
        answer: "True"
      }
    ]
  },
  "help-businesses-use-data-to-make-better-decisions": {
    name: "Help businesses use data to make better decisions",
    questions: [
      {
        type: "single",
        match: "Business intelligence solutions transform data into actionable insights",
        answer: "True"
      },
      {
        type: "selects",
        match: "Match the questions to different opportunities for business intelligence solutions",
        answers: ["Data mobility", "Data utilisation", "Business insights"]
      },
      {
        type: "multiple",
        match: "How do business intelligence solutions designed for Apple products provide value",
        answers: [
          "Business intelligence solutions help unify siloed data",
          "Business intelligence solutions use the same data for multiple reports",
          "Business intelligence solutions engage built-in security",
          "Business intelligence solutions empower a broad range of users"
        ]
      },
      {
        type: "single",
        match: "Ad hoc systems are inefficient when compared to a single",
        answer: "True"
      },
      {
        type: "single",
        match: "iPhone and iPad have built-in security features that make them ideal",
        answer: "True"
      }
    ]
  },
  "help-businesses-stay-connected-with-secure-virtual-workspaces": {
    name: "Help businesses stay connected with secure virtual workspaces",
    questions: [
      {
        type: "single",
        match: "Modern collaboration solutions help teams connect from anywhere",
        answer: "True"
      },
      {
        type: "selects",
        match: "Match the questions to different opportunities for collaboration solutions",
        answers: ["Business agility", "Team interaction", "Workplace experience"]
      },
      {
        type: "multiple",
        match: "disadvantages of using voice calls from desk phones as a collaboration solution",
        answers: [
          "This solution doesn’t allow for screen sharing.",
          "This solution allows for inattentiveness.",
          "This solution makes it difficult to gauge attendees’ reactions"
        ]
      },
      {
        type: "single",
        match: "In-person meetings aren’t ideal for collaboration",
        answer: "True"
      },
      {
        type: "single",
        match: "Apple devices can give employees everything they need to make better business decisions",
        answer: "True"
      }
    ]
  },
  "help-businesses-modernise-contract-processes": {
    name: "Help businesses modernise contract processes",
    questions: [
      {
        type: "single",
        match: "Digital contract management eliminates human error and reduces paper costs",
        answer: "False"
      },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a contract management solution",
        answers: [
          "Do employees need to get approvals or sign contracts quickly?",
          "How do you track what contracts have been signed",
          "Does your company miss out on opportunities for revenue"
        ]
      },
      {
        type: "multiple",
        match: "why printed documents are NOT ideal for contract management",
        answers: [
          "They must be stored.",
          "They increase human errors.",
          "They can be expensive."
        ]
      },
      {
        type: "single",
        match: "Delivering files by email is efficient because email attachments are easy to locate",
        answer: "False"
      }
    ]
  },
  "customer-relationship-management-essentials": {
    name: "Customer relationship management essentials",
    questions: [
      {
        type: "single",
        match: "Modern CRM solutions help sales teams quickly deliver highly personalised customer experiences",
        answer: "True"
      },
      {
        type: "multiple",
        match: "identify opportunities for how a CRM solution could support your customer’s business",
        answers: [
          "Does your marketing team have a queue of qualified, sales-ready leads?",
          "How long do you spend on reporting and forecasting?",
          "How do you track sales opportunities from start to finish?"
        ]
      },
      {
        type: "multiple",
        match: "Why are spreadsheets challenging to work with as a CRM solution",
        answers: [
          "They are time consuming to manage.",
          "They lack a central archive for opportunities and deals.",
          "There is no easy way to collaborate."
        ]
      },
      {
        type: "single",
        match: "CRM stands for customer relationship management",
        answer: "True"
      },
      {
        type: "single",
        match: "iPhone and iPad are intuitive and easy to use",
        answer: "True"
      }
    ]
  },
  "document-management-essentials": {
    name: "Document management essentials",
    questions: [
      { type: "single", match: "Legacy document management systems make workplace collaboration", answer: "True" },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a document management solution",
        answers: [
          "Does your organisation use cloud apps?",
          "How does your organisation share information internally and externally",
          "Are your employees sending sensitive information through email attachments?"
        ]
      },
      {
        type: "multiple",
        match: "best describes on-premise or legacy file services",
        answers: [
          "They provide a poor user experience.",
          "They aren’t optimised for mobile, highly collaborative workforces.",
          "They can be expensive to service and maintain."
        ]
      },
      { type: "single", match: "Line of business applications are not ideal because they lead to content silos", answer: "True" },
      { type: "single", match: "apps made by Apple and third parties can only access data in authorised ways", answer: "True" }
    ]
  },
  "mobile-forms-essentials": {
    name: "Mobile forms essentials",
    questions: [
      { type: "single", match: "Completing forms through a digital mobile forms solution is less expensive", answer: "True" },
      {
        type: "selects",
        match: "Match the questions to different opportunities for mobile forms solutions",
        answers: ["Data collection and management", "Current workflows", "Inefficiencies"]
      },
      {
        type: "multiple",
        match: "disadvantage of using paper-based forms in the field",
        answers: [
          "Paper-based forms waste natural resources.",
          "Paper-based forms require secure storage.",
          "Paper-based forms can be difficult to edit without producing multiple copies."
        ]
      },
      { type: "single", match: "Extensions to back-office databases aren’t ideal for mobile forms", answer: "True" },
      { type: "single", match: "Information in Apple devices is continually encrypted", answer: "True" }
    ]
  },
  "queue-management-essentials": {
    name: "Queue management essentials",
    questions: [
      {
        type: "multiple",
        match: "major challenges in queue management",
        answers: ["Keeping physical queues organised", "Letting employees know why a customer is there"]
      },
      { type: "single", match: "Using Apple TV to rotate advertising messages between queue notifications", answer: "True" },
      {
        type: "multiple",
        match: "identify opportunities for a queue management solution",
        answers: [
          "How do you manage individual customer requests?",
          "How do you track waiting times at your service locations?",
          "Are your customers experiencing disorganised queues"
        ]
      },
      {
        type: "multiple",
        match: "disadvantages of using paper tickets for queue management",
        answers: ["Loss of tickets", "Loss of place in the queue", "Empty paper rolls in ticket holders"]
      },
      { type: "single", match: "customers can spend more time focusing on the experience", answer: "True" }
    ]
  },
  "task-management-essentials": {
    name: "Task management essentials",
    questions: [
      {
        type: "multiple",
        match: "major challenges in task management",
        answers: ["Consistency", "Employee turnover", "Constantly changing processes"]
      },
      {
        type: "multiple",
        match: "benefits can be achieved by implementing a task management solution",
        answers: ["Accelerated onboarding", "Increased operational efficiency", "Task calendars"]
      },
      {
        type: "multiple",
        match: "Why is manual task management, such as using paper checklists, NOT ideal",
        answers: ["Takes more time", "Requires checking on employees", "No way to ensure consistency"]
      },
      { type: "single", match: "task management solutions can use photo records to verify tasks", answer: "True" },
      {
        type: "selects",
        match: "Match the questions to different opportunities for task management solutions",
        answers: ["Upholding operating standards", "Task management processes", "Operational intelligence"]
      }
    ]
  },
  "training-and-enablement-essentials": {
    name: "Training and enablement essentials",
    questions: [
      { type: "single", match: "training and enablement solution allows employees to access the right content", answer: "True" },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a training and enablement solution",
        answers: [
          "How do your sales or service representatives access the content",
          "Do you currently have insight into how often",
          "How do you know if your representatives are using the most up-to-date materials?"
        ]
      },
      {
        type: "multiple",
        match: "disadvantages of email as a training and enablement solution",
        answers: [
          "This solution has no control over which file version",
          "This solution gives no insight into who has opened the content.",
          "This solution enables employees to easily miss the content."
        ]
      },
      { type: "single", match: "Websites aren’t ideal for training and enablement", answer: "True" },
      { type: "single", match: "employees can stay organised and adapt to new programs", answer: "True" }
    ]
  },
  "virtual-training-essentials": {
    name: "Virtual training essentials",
    questions: [
      { type: "single", match: "Virtual training empowers employees to learn procedures", answer: "True" },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a virtual training solution",
        answers: [
          "How do you currently conduct your training?",
          "What percentage of your training is hands-on?",
          "Would you like to reduce your training budget"
        ]
      },
      {
        type: "multiple",
        match: "disadvantages of using training manuals, presentations and videos",
        answers: [
          "This solution creates a passive learning experience.",
          "This solution doesn’t give employees a chance to practise critical procedures.",
          "This solution becomes outdated quickly."
        ]
      },
      { type: "single", match: "E-learning solutions aren’t ideal for virtual training", answer: "True" },
      { type: "single", match: "employees can seamlessly undertake virtual learning experiences", answer: "True" }
    ]
  },
  "workforce-management-essentials": {
    name: "Workforce management essentials",
    questions: [
      {
        type: "multiple",
        match: "major challenge in workforce management",
        answers: ["Employee scheduling", "Labour law compliance", "Meeting customer demand"]
      },
      {
        type: "multiple",
        match: "rely on manual implementations, including pen-and-paper processes and spreadsheets",
        answers: ["User errors", "Poor forecasting", "Lack of mobile support"]
      },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a workforce management solution",
        answers: [
          "How do you create schedules and how long does it take you?",
          "How do your front-line employees communicate with each other?",
          "Who is responsible for labour compliance issues?"
        ]
      },
      { type: "single", match: "organisations can easily manage their scheduling tasks by swiping", answer: "True" },
      {
        type: "multiple",
        match: "benefits can be achieved by implementing a workforce management solution",
        answers: ["Simpler time tracking and communication", "Improved employee retention", "Automatic schedule creation"]
      }
    ]
  },
  "applecare-for-business-quiz": {
    name: "בוחן – מוצרי AppleCare לעסקים",
    questions: [
      { type: "single", match: "כוללת מספר בלתי מוגבל של אירועים ברמת הארגון", answer: "Alliance" },
      { type: "multiple", match: "היתרונות העיקריים של AppleCare for Enterprise", answers: ["תמיכה טכנית ממומחים", "מאגר שירות", "תיקון מכשירים בעדיפות"] },
      { type: "single", match: "המטרה של האפשרויות Service Pool", answer: "לאפשר תיקונים והחלפות של מכשירים מכל סיבה שהיא" },
      { type: "selects", match: "התאימו את מוצרי AppleCare הבאים לתכונות שלהם", answers: ["AppleCare for Enterprise", "תמיכת OS של AppleCare", "תמיכה טכנית של AppleCare"] },
      { type: "multiple", match: "להבין טוב יותר את החששות שלהם לגבי AppleCare", answers: ["מאיפה תשיגו מכשירים חלופיים?", "האם אתם צריכים להגדיל את צוות התמיכה ב-IT", "מה אתם עושים אם מכשיר מתקלקל?"] }
    ]
  },
  "apple-device-management-at-work-quiz": {
    name: "בוחן – ניהול מכשירי Apple בעבודה",
    questions: [
      { type: "multiple", match: "להבין את צורכי הפריסה של הלקוחות", answers: ["מה מחלקת ה‑IT צריכה לעשות", "מה העובדים צריכים לעשות כדי להגדיר", "איך אתם מנהלים את מכשירי ה-iPhone שלכם?"] },
      // "רישום משתמשים" (User Enrolment) is not one of the options this quiz
      // offers, so the question was left empty and the whole attempt went in
      // at 75%. Of what it does offer, the managed account is what separates
      // work data from personal data.
      { type: "single", match: "מפריד בין נתונים בעבודה לבין נתונים אישיים", answer: "חשבונות Apple מנוהלים" },
      { type: "multiple", match: "תומכת בארגונים בתהליכי הפריסה", answers: ["תוכנה שעובדת עם שירותי ניהול המכשירים", "תמיכה בטלפון ובדוא\"ל לפריסת מערכות ההפעלה", "הכשרה בנושא ניהול מכשירים"] },
      { type: "single", match: "מאפיינים העיקריים של Apple Business המסייע בפריסה", answer: "רישום מכשירים אוטומטי" }
    ]
  },
  // "הקצאת מכשירים" / Device assignment. These four are what Apple Business
  // Manager actually does, not answers a grade has confirmed; the fifth
  // question (the three search filters) is deliberately left out so the run
  // guesses it and learns it from the grade. Any of these that turns out wrong
  // is cleared and re-guessed on the next attempt in the same visit.
  "device-assignment-quiz": {
    name: "הקצאת מכשירים",
    questions: [
      { type: "single", match: "מתי צריך לשחרר מכשיר מ-Apple Business Manager", answer: "אם המכשיר אבד, הוצא משימוש, נמכר או אינו ניתן לתיקון" },
      { type: "single", match: "קריטריונים ניתן להשתמש לצורך הקצאת מכשירים אוטומטית", answer: "סוג המכשיר" },
      { type: "single", match: "כיצד ניתן להוסיף מחשבי Mac באופן ידני", answer: "באמצעות Apple Configurator ל-iPhone" },
      { type: "single", match: "לכמה פתרונות MDM ניתן להקצות מכשיר", answer: "אחד" },
      // Confirmed by the server's saved 20% attempt: this was the one question
      // graded correct. Serial number is searchable, but it was not one of the
      // three answers expected by this version of the course.
      { type: "multiple", match: "אפשרויות סינון תוכלו להשתמש כדי לחפש מכשירים", answers: ["גודל האחסון", "מספר הזמנה", "סוג המכשיר"] }
    ]
  },
  "clienteling-essentials": {
    name: "Clienteling essentials",
    questions: [
      { type: "single", match: "Clienteling is a customer service technique", answer: "True" },
      { type: "multiple", match: "ability can help sales assistants increase sales", answers: ["Knowing customers’ personal preferences", "Knowing customers’ past purchases", "Knowing customers’ sizes"] },
      { type: "multiple", match: "identify an opportunity to recommend a clienteling solution", answers: ["How are you looking to improve the in-store experience", "Are your sales assistants challenged to cross-sell", "Do you struggle with retraining your workforce"] },
      { type: "single", match: "fixed point of sale device as a clienteling solution", answer: "True" },
      { type: "single", match: "Apple devices work seamlessly with key infrastructure services", answer: "True" }
    ]
  },
  "construction-project-management-essentials": {
    name: "Construction project management essentials",
    questions: [
      { type: "multiple", match: "major challenge in construction project management", answers: ["Workflows", "Document management", "Team collaboration"] },
      { type: "multiple", match: "rely on pen and paper at job sites", answers: ["Information-sharing delays", "Data loss", "Wasted time"] },
      { type: "multiple", match: "benefits of implementing a construction project management solution", answers: ["More efficient workflows", "Data security", "Easy-to-use tools for field employees"] },
      { type: "multiple", match: "identify an opportunity to recommend a construction project management solution", answers: ["How do you know when a project is at risk", "How do your teams stay in sync", "How many hours per day are spent on administrative tasks"] }
    ]
  },
  "custom-inspection-solutions-essentials": {
    name: "Custom inspection solutions essentials",
    questions: [
      { type: "multiple", match: "challenges can a custom inspection solution help", answers: ["Keeping customers informed", "Avoiding lost documents", "Automating clerical workflows"] },
      { type: "multiple", match: "identify an opportunity to recommend a custom inspection solution", answers: ["How do your adjusters use software systems", "What obstacles do your customers encounter when filing claims?", "How long does it take your adjusters"] },
      { type: "single", match: "powerful hardware and custom inspection solutions allow insurers", answer: "True" },
      { type: "multiple", match: "objections do organisations often have when considering a custom inspection", answers: ["doesn’t have the money to invest", "Mobility isn’t a priority.", "A new tool will disrupt workflows."] }
    ]
  },
  "custom-needs-analysis-solutions-essentials": {
    name: "Custom needs analysis solutions essentials",
    questions: [
      { type: "multiple", match: "Why do insurers conduct needs analyses", answers: ["To help customers understand the needs of their cover", "To simplify complex insurance products"] },
      { type: "multiple", match: "identify an opportunity to recommend a custom needs-analysis solution", answers: ["Where in the sales process do your agents use pen and paper?", "How long does it take agents to send a summary", "Are your agents able to lead effective sales meetings"] },
      { type: "multiple", match: "continuing to use existing systems of record", answers: ["Lost productivity", "Agents need to use multiple apps to complete work"] },
      { type: "multiple", match: "hardware and software tools can insurers use in the needs-analysis", answers: ["Apple Pencil", "Microphones and voice-to-text"] },
      { type: "multiple", match: "objections do organisations often have when considering a custom needs-analysis", answers: ["doesn’t have the money to invest", "Mobility isn’t a priority.", "already uses bespoke solutions"] }
    ]
  },
  "customer-onboarding-financial-services-essentials": {
    name: "Customer onboarding in financial services essentials",
    questions: [
      { type: "multiple", match: "biggest issues in customer onboarding", answers: ["length of time it takes to open an account", "Duplication of data in different systems", "Large amounts of paper"] },
      { type: "multiple", match: "identify an opportunity to recommend a customer onboarding solution", answers: ["Where in your customer onboarding process", "How long does it take to onboard customers", "What is the rate of turnover in your branches?"] },
      { type: "multiple", match: "problems with using paper forms for customer onboarding", answers: ["Illegible data", "Expense of printing and shredding"] },
      { type: "multiple", match: "Apple products and features can bank workers use", answers: ["Apple Pencil", "Built-in camera"] },
      { type: "multiple", match: "benefits of implementing a customer onboarding solution", answers: ["manual data entry is reduced", "Customer confidence is built.", "Time is freed up"] }
    ]
  },
  "device-management-essentials": {
    name: "Device management essentials",
    questions: [
      { type: "multiple", match: "major challenge in device management", answers: ["Secure access to company apps and data", "Automation of software updates"] },
      { type: "multiple", match: "identify an opportunity to recommend a device management solution", answers: ["deploy and configure devices remotely", "Do software updates interfere", "remotely wipe sensitive company data"] },
      { type: "multiple", match: "set up their devices manually", answers: ["Risk of malware or a data breach", "Increased IT workloads", "Lost employee productivity"] },
      { type: "single", match: "flexible deployment models allow employees to get up and running", answer: "True" },
      { type: "multiple", match: "benefits can be achieved by implementing a device management solution", answers: ["Enforce security compliance in real time", "Enable users to set up their own devices", "Provide customers with encrypted devices"] }
    ]
  },
  "endpoint-security-essentials": {
    name: "Endpoint security essentials",
    questions: [
      { type: "multiple", match: "major challenge in endpoint security", answers: ["Preventing phishing attacks", "Stopping malware", "Restricting access to unsanctioned websites"] },
      { type: "multiple", match: "identify an opportunity to recommend an endpoint security solution", answers: ["automatically stop employees from connecting", "How quickly can you identify the impact", "protect your employees from phishing attacks"] },
      { type: "multiple", match: "manual security practices and ad hoc solutions", answers: ["Exposure to risk", "Device protection only on corporate networks", "Time-consuming deployment"] },
      { type: "single", match: "coupled with the Cisco Security Connector", answer: "True" },
      { type: "multiple", match: "benefits can be achieved by implementing an endpoint security", answers: ["Comprehensive view of network traffic", "Reduction of security threats"] },
      { type: "multiple", match: "common concerns of organisations that may benefit from implementing an endpoint security", answers: ["Protecting devices of employees who regularly work off-site", "Preventing access to restricted websites"] }
    ]
  },
  "field-mapping-essentials": {
    name: "Field mapping essentials",
    questions: [
      { type: "multiple", match: "major challenges in field mapping", answers: ["Workflows", "Reliable shared maps", "Collaboration"] },
      { type: "multiple", match: "benefits can be achieved by implementing a field-mapping solution", answers: ["Cut operational expenses", "Reduce downtime", "Keep field data in sync with the office"] },
      { type: "multiple", match: "problems with using paper maps in the field", answers: ["Expensive", "Hard to keep up to date", "Difficult to transport"] },
      { type: "multiple", match: "identify an opportunity to recommend a field-mapping solution", answers: ["field workers still performing on paper", "locations of field workers", "data are workers collecting in the field"] },
      { type: "single", match: "field-mapping solutions can be used offline", answer: "True" }
    ]
  },
  "food-order-management-essentials": {
    name: "Food order management essentials",
    questions: [
      { type: "multiple", match: "major challenges in food order management", answers: ["Entering orders into a fixed POS terminal", "Waiting staff requirements", "Order errors"] },
      { type: "multiple", match: "benefits can be achieved by implementing a food order management", answers: ["Elimination of back and forth to POS terminals", "Increased tips", "Improved order accuracy"] },
      { type: "multiple", match: "manual food order management", answers: ["Transcription errors", "Reduced time on the dining floor"] },
      { type: "multiple", match: "identify an opportunity to recommend a food order management", answers: ["if each server could manage larger sections", "congestion at your POS terminals"] },
      { type: "single", match: "Food order management solutions can generate higher tips", answer: "True" }
    ]
  },
  "food-safety-essentials": {
    name: "Food safety essentials",
    questions: [
      { type: "multiple", match: "benefits can be achieved by implementing a food safety solution", answers: ["Providing regulation-compliant labels", "Tracking shop performance", "Ensuring a consistent brand experience"] },
      { type: "multiple", match: "problems with food safety methods", answers: ["Prone to “pencil whipping”", "Potential errors when calculating expiry dates", "No mitigation instructions"] },
      { type: "multiple", match: "identify an opportunity to recommend a food safety solution", answers: ["Do you use pre-printed grab-and-go labels?", "How do you verify temperature logs?"] },
      { type: "single", match: "positive ROI in less than four months", answer: "True" },
      { type: "multiple", match: "major challenges in food safety", answers: ["Compliance with protocols and regulations", "Food labelling", "Food waste and other inefficiencies"] }
    ]
  },
  "identity-management-essentials": {
    name: "Identity management essentials",
    questions: [
      { type: "multiple", match: "major challenges in identity management", answers: ["Secure access to apps and data", "Secure single sign-on"] },
      { type: "multiple", match: "identify an opportunity to recommend an identity management solution", answers: ["use single sign-on", "How long does it take your new starters", "only have access to the apps they need"] },
      { type: "multiple", match: "multiple logins and manual processes", answers: ["Risk of phishing or identity theft", "Increased IT workloads", "Employee failure to follow best practices"] },
      { type: "multiple", match: "benefits can be achieved by implementing an identity management", answers: ["Secure, user-friendly login processes", "Reduced IT workloads", "Comprehensive access data and system logs"] },
      { type: "multiple", match: "common concerns of organisations that could benefit from implementing an identity management", answers: ["Providing access to applications and data", "Connecting people to the tools", "Avoiding complicated sign-on processes"] }
    ]
  },
  "mobile-pos-essentials": {
    name: "Mobile POS essentials",
    questions: [
      { type: "multiple", match: "best describes a mobile POS solution", answers: ["deliver efficient services to consumers", "eliminates long queues", "engage customers from anywhere"] },
      { type: "multiple", match: "identify an opportunity to recommend a mobile POS solution", answers: ["long queues of customers", "time training new employees", "reporting capabilities you need from your POS"] },
      { type: "multiple", match: "Why is hosting in-store servers not ideal", answers: ["It requires maintenance.", "It can be expensive.", "difficult to remotely access real-time information"] },
      { type: "single", match: "multiple fixed POS solution", answer: "False" },
      { type: "single", match: "complete transactions from wherever they are in the shop", answer: "True" }
    ]
  },
  "mobile-pos-restaurants-essentials": {
    name: "Mobile POS in restaurants essentials",
    questions: [
      { type: "multiple", match: "major challenges in POS in restaurants", answers: ["Changing consumer behaviours", "POS expenses", "Multiple customer channels"] },
      { type: "multiple", match: "benefits can be achieved by implementing a mobile POS in restaurants", answers: ["More floor space for dining", "Kitchen display system (KDS) integration", "Table payments"] },
      { type: "multiple", match: "issues with fixed POS systems in restaurants", answers: ["Leaving a guest’s side", "Lines at the terminal", "High hardware costs"] },
      { type: "multiple", match: "identify an opportunity to recommend a mobile POS in restaurants", answers: ["How long does it take for a server to process", "Does your system have an option for mobility?"] },
      { type: "single", match: "Migrating to a mobile POS system means re-entering menus", answer: "False" }
    ]
  },
  "mobile-scanning-essentials": {
    name: "Mobile scanning essentials",
    questions: [
      { type: "multiple", match: "common uses for scanning in factory environments", answers: ["Ensuring accurate receipt, transit and tracking", "Creating detailed, accurate stock information"] },
      { type: "multiple", match: "major issues with dedicated hardware scanning systems", answers: ["costly to maintain", "substantial hardware investment", "cumbersome user experiences"] },
      { type: "single", match: "factory workers can perform accurate barcode scans and OCR", answer: "True" },
      { type: "multiple", match: "benefits of implementing a mobile scanning solution", answers: ["Increased productivity", "Real-time insights provided through AR overlays", "Lower total cost of ownership"] },
      { type: "multiple", match: "problems companies may face if they build their own in-house scanning", answers: ["High costs", "Difficulty scaling", "Difficulty maintaining and updating"] }
    ]
  },
  "safety-management-warehousing-logistics-essentials": {
    name: "Safety management in warehousing and logistics essentials",
    questions: [
      { type: "multiple", match: "benefit from implementing a safety management solution", answers: ["Access to mobile devices and apps when appropriate", "Prevention of accidents and injuries"] },
      { type: "multiple", match: "rely on cameras to enforce safety policies", answers: ["Remediation must be done after the fact.", "They don’t prevent distraction or accidents."] },
      { type: "multiple", match: "identify opportunities to show how a safety management solution", answers: ["driver or operator distractions", "accidents in the delivery process", "compliance regulations are tied"] },
      { type: "multiple", match: "safety management solution designed for Apple devices help", answers: ["Allow safe use of critical business apps", "Manage policy adherence via reports and alerts", "Automatically adjust policy enforcement"] },
      { type: "single", match: "enforce mobile safety policies when devices are both online and offline", answer: "True" }
    ]
  },
  "shipping-and-receiving-essentials": {
    name: "Shipping and receiving essentials",
    questions: [
      { type: "multiple", match: "benefit from implementing a shipping and receiving solution", answers: ["Creating and tracking product stock", "Improving worker productivity", "Reduced inefficiencies"] },
      { type: "multiple", match: "exclusively use desktop and portable computers", answers: ["Inaccurate records", "Difficulty in scanning and documentation", "Hard to communicate"] },
      { type: "multiple", match: "identify opportunities to show how a shipping and receiving solution", answers: ["warehouse employees currently enter data", "carry out cycle counts"] },
      { type: "multiple", match: "shipping and receiving solution designed for Apple devices help", answers: ["Expedite fulfilment times", "Eliminate shipping and documentation errors"] },
      { type: "single", match: "need an IT team with expertise in custom development", answer: "False" }
    ]
  },
  "skill-and-work-instruction-essentials": {
    name: "Skill and work instruction essentials",
    questions: [
      { type: "multiple", match: "employees are skill and work instruction solutions designed", answers: ["Warehouse workers", "Factory workers"] },
      { type: "multiple", match: "problems with using paper manuals or classroom-based instruction", answers: ["don't remember their classroom training", "can't easily refer to paper documents", "can't easily update training processes"] },
      { type: "multiple", match: "differences between a skill and work instruction solution and a learning management", answers: ["LMS solutions are designed to meet the needs of office workers.", "Skill and work instruction solutions can make workers more autonomous."] },
      { type: "multiple", match: "benefits of implementing a skill and work instruction solution", answers: ["Reduced time spent training", "Reduced impact of turnover and absenteeism", "Reduced manufacturing waste"] },
      { type: "single", match: "factory workers can autonomously create high-quality training materials", answer: "True" }
    ]
  },
  "wealth-financial-review-essentials": {
    name: "Wealth and financial review essentials",
    questions: [
      { type: "multiple", match: "Why do financial management companies conduct wealth and financial reviews", answers: ["help clients understand their financial needs", "explain investment products"] },
      { type: "multiple", match: "identify an opportunity to recommend a custom wealth and financial review", answers: ["Where in the wealth and financial review process", "document and track interactions", "lead remote meetings with clients"] },
      { type: "multiple", match: "challenges of using spreadsheets during wealth and financial review", answers: ["time consuming to create and maintain", "fail to engage the client", "hard to update during meetings"] },
      { type: "multiple", match: "Apple products and features can advisers use", answers: ["Apple Pencil", "Microphones and voice-to-text"] },
      { type: "multiple", match: "benefits of implementing a custom wealth and financial review", answers: ["manual data entry is reduced", "Clients can be met remotely"] }
    ]
  },
  "wifi-optimisation-essentials": {
    name: "Wi-Fi optimisation essentials",
    questions: [
      { type: "multiple", match: "major challenges for Wi-Fi networks", answers: ["Speed of access to applications", "Service outages", "Connection security"] },
      { type: "multiple", match: "identify an opportunity to recommend a Wi-Fi optimisation solution", answers: ["Wi-Fi infrastructure been able to keep up", "issues with mobile devices led to decreased productivity", "troubleshoot Wi-Fi issues"] },
      { type: "multiple", match: "piecemeal approach to Wi-Fi optimisation", answers: ["Vulnerabilities across organisations", "Inconsistent employee workflows", "More IT support tickets"] },
      { type: "single", match: "coupled with Wi-Fi optimisation solutions allow organisations", answer: "True" },
      { type: "multiple", match: "benefits can be achieved by implementing a Wi-Fi optimisation", answers: ["Seamless roaming for employee devices", "Comprehensive analytics"] }
    ]
  },
  "quality-control-essentials": {
    name: "Quality control essentials",
    questions: [
      {
        type: "multiple",
        match: "ways that a company could benefit from implementing a quality control solution",
        answers: ["Improved output", "Faster inspections processes"]
      },
      {
        type: "multiple",
        match: "still rely on manual inspections. Why is this process NOT ideal",
        answers: ["Low volume of inspections possible", "Inspectors become ineffective and imprecise"]
      },
      {
        type: "multiple",
        match: "identify opportunities to show how a quality control solution could support their business",
        answers: [
          "How often do your employees have to put themselves in potentially dangerous situations",
          "How would your business benefit from enabling your workers to create custom models",
          "How often do your employees make preventable errors while conducting quality control inspections?"
        ]
      },
      {
        type: "multiple",
        match: "quality control solution designed for Apple devices help",
        answers: [
          "Reduce the number of damaged or faulty goods delivered to customers",
          "Use real-time visibility of inspections to identify manufacturing issues that may affect customers"
        ]
      },
      {
        type: "single",
        match: "use AI to develop inspection models without coding expertise",
        answer: "True"
      }
    ]
  },
  "stock-management-warehousing-logistics-essentials": {
    name: "Stock management in warehousing and logistics essentials",
    questions: [
      {
        type: "multiple",
        match: "benefit from implementing a stock management solution",
        answers: ["Real-time insights into stock", "Keeping up with increased pace and higher expectations"]
      },
      {
        type: "multiple",
        match: "still rely on spreadsheets to track stock. Why is this process NOT ideal",
        answers: ["No central archive", "Information gets out of date", "Difficult to collaborate"]
      },
      {
        type: "multiple",
        match: "identify opportunities of how a stock management solution could support their business",
        answers: [
          "How often do customers complain about receiving the wrong items?",
          "How often do you have to perform cycle counts or full physical stock counts?"
        ]
      },
      {
        type: "multiple",
        match: "stock management solution designed for Apple devices help",
        answers: ["Integrate with ERP and other operations systems", "Decrease the cost to fulfil orders"]
      },
      {
        type: "single",
        match: "safe to use Apple devices in rugged and extreme warehouse environments",
        answer: "True"
      }
    ]
  },
  "kitchen-display-system-essentials": {
    name: "Kitchen display system essentials",
    questions: [
      {
        type: "multiple",
        match: "challenges in restaurant kitchens",
        answers: ["Workflows", "Staff shortages", "Environmental concerns"]
      },
      {
        type: "multiple",
        match: "problems with using paper tickets in restaurant kitchens",
        answers: ["Order errors", "Misplaced tickets", "Wasted paper"]
      },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a kitchen display system",
        answers: [
          "How do the kitchen staff know how long an order has been in the queue?",
          "How much food is wasted by incorrect order preparation?",
          "How do you communicate orders from your waiting staff to the kitchen?"
        ]
      },
      {
        type: "single",
        match: "Kitchen display systems ensure paper tickets are printed",
        answer: "False"
      },
      {
        type: "multiple",
        match: "benefits can be achieved by implementing a kitchen display system",
        answers: ["Reduction in food waste", "Faster service", "Increased tips"]
      }
    ]
  },
  "work-order-management-essentials-final": {
    name: "Work order management essentials",
    questions: [
      {
        type: "single",
        match: "Work order management solutions increase safety and productivity",
        answer: "True"
      },
      {
        type: "multiple",
        match: "identify an opportunity to recommend a work order management solution",
        answers: [
          "How much downtime does your business experience as a result of safety incidents?",
          "What maintenance tasks do your teams use paper forms for?",
          "How would real-time access to systems and asset information improve your business?"
        ]
      },
      {
        type: "multiple",
        match: "disadvantages of using a spreadsheet or other database as a work order management solution",
        answers: [
          "These solutions create data that isn’t accessible everywhere.",
          "Once shared, these solutions require an internet connection to provide access.",
          "These solutions require data collected in the field to be entered manually later."
        ]
      },
      {
        type: "single",
        match: "Paper-based processes often result in poor data quality",
        answer: "True"
      },
      {
        type: "single",
        match: "Many work order management solutions can be used offline",
        answer: "True"
      }
    ]
  },
  "esim-knowledge-check": {
    name: "בדיקת ידע בנושא eSIM",
    questions: [
      { type: "multiple", match: "איזה חיבור נדרש להפעלת eSIM", answers: ["חיבור סלולרי", "רשת אלחוטית"] },
      { type: "single", match: "יכולים להגדיר eSIM רק כשהם מגיעים ליעד", answer: "לא נכון" },
      { type: "multiple", match: "מהן התועלות של eSIM", answers: ["אי אפשר להסיר אותו מה‑iPhone", "אפשר להשתמש בשני קווים פעילים בו‑זמנית"] },
      { type: "single", match: "באיזו שיטה להפעלת eSIM המפעיל הסלולרי שלהם תומך", answer: "לעיין במשאב הרלוונטי של התמיכה של Apple" },
      { type: "single", match: "עוברים מ‑Android ל‑iPhone", answer: "Carrier Activation (הפעלה אצל מפעיל סלולרי)" },
      { type: "single", match: "דגמי iPhone יכולים לאחסן יותר מ‑eSIM אחד", answer: "נכון" },
      { type: "single", match: "עם אילו סוגי לקוחות כדאי לדבר על הפעלת eSIM", answer: "עם כל לקוח iPhone" },
      { type: "single", match: "משדרגים את ה‑iPhone שלהם", answer: "Quick Transfer (העברה מהירה)" }
    ]
  },
  "airpods-beyond-flagship-knowledge-check": {
    name: "בוחן – מוכנים למצב את ה‑AirPods מעבר למכשירי דגל?",
    questions: [
      { type: "single", match: "שרון נכנסת ורוצה iPhone חדש", answer: "לבדוק בקצרה אם גם תחום השמע עשוי לעניין אותה" },
      { type: "single", match: "שאלות פתוחות על שגרת היומיום יכולות לחשוף צרכים", answer: "נכון" },
      { type: "single", match: "דנה אומרת שעבודה ונסיעות הם הדברים שהכי חשובים לה", answer: "להמליץ על האפשרות שהכי מתאימה למה שהיא אמרה לכם הרגע" },
      { type: "multiple", match: "תום מטיל ספק אם ה‑AirPods שווים את המחיר", answers: ["כדאי להתמקד במה שישפר באמת את האופן שבו הוא משתמש במכשירים שלו מדי יום", "לקשר בין מאפיינים לתועלות ממשיות בחיי היומיום שלו"] },
      { type: "single", match: "לקרן יש סגנון ברור ותקציב בראש", answer: "להציג בפניה כמה אפשרויות שמתאימות לסגנון ולתקציב שלה, ולתת לה להחליט" },
      { type: "single", match: "לליאם יש מאפיינים זמינים שהוא לא יודע על קיומם", answer: "לתאר רגע בחייו שבו המאפיין יועיל לו משמעותית" },
      { type: "single", match: "נראה שדין מתלבט בין שתי אפשרויות", answer: "לא" }
    ]
  },
  // Chapter: "סיפור הפלטפורמה של Apple – לפי דרישה". Answers marked
  // `unverified` were not confirmed by a grade and are a best guess.
  "why-apple-platform-knowledge-check": {
    name: "מדוע כדאי לבחור ב-Apple",
    section: "הסיפור של הפלטפורמה",
    questions: [
      { type: "multiple", match: "מה ג'וני אמר שהם שני היתרונות העיקריים עבור הלקוחות בתכנון של החומרה והתוכנה", answers: ["ביצועים", "אמינות"] },
      { type: "single", match: "מדוע Apple נחשבת לפלטפורמה הטובה ביותר למשתמשים, לאנשי IT ולעסקים", answer: "הפלטפורמה של Apple מספקת שילוב חלק בין מכשירים, ומבטיחה חוויית משתמש מגובשת וניהול יעיל עבור מחלקות IT, תוך שהיא מקנה תחושה של יעילות פיננסית." }
    ]
  },
  "apple-intelligence-knowledge-check": {
    name: "Apple Intelligence",
    section: "הסיפור של הפלטפורמה",
    questions: [
      { type: "single", match: "לפי טמזין, לאיזה מאפיין תהיה אחת ההשפעות הגדולות ביותר על הלקוחות", answer: "'כלי כתיבה'", unverified: true },
      { type: "single", match: "מה Apple עושה עם 'ענן חישוב פרטי' שהוא חדש בתעשייה", answer: "הבטחת פרטיות הניתנת לאימות" },
      { type: "multiple", match: "אילו מהמכשירים הבאים תומכים ב-Apple Intelligence", answers: ["iPhone 16e", "iPad Air (שבב M3)", "MacBook Air (שבב M1)"] }
    ]
  },
  "best-platform-for-it-knowledge-check": {
    name: "הפלטפורמה הטובה ביותר ל-IT",
    section: "הסיפור של הפלטפורמה",
    questions: [
      { type: "multiple", match: "מהם המרכיבים העיקריים הדרושים לפעולה של פריסה ללא מגע", answers: ["Apple Business / School Manager", "ניהול מכשירים ניידים", "מכשירי Apple"] },
      { type: "multiple", match: "מהם היתרונות של פריסת מכשירים ללא מגע", answers: ["מהירה ומאובטחת", "הגדרה אוטומטית", "ניתנת להתאמה אישית במידה רבה"] },
      { type: "single", match: "באמצעות פריסה ללא מגע, צוותי IT יכולים לפרוס פרופילים מרחוק", answer: "נכון" }
    ]
  },
  "best-platform-for-business-knowledge-check": {
    name: "הפלטפורמה הטובה ביותר לעסקים",
    section: "הסיפור של הפלטפורמה",
    questions: [
      { type: "selects", match: "התאימו את עקרונות הפרטיות העיקריים להסבר", answers: ["שקיפות ושליטה", "עיבוד במכשיר", "צמצום נתונים", "אמצעי הגנה לאבטחה"] },
      { type: "multiple", match: "אילו מהמוצרים הבאים הם המוצרים הראשונים שלנו שהם ניטרליים פחמנית", answers: ["Apple Watch Series 10", "Apple Watch Ultra 2", "Mac mini"] },
      { type: "single", match: "מהו החסכון הכולל לאורך מחזור החיים של כל Mac שנפרס", answer: "$847", unverified: true }
    ]
  },
  // Curriculum "Technical". Answers come from the 2026-08-31 blind run:
  // what the site marked correct is kept, what it marked wrong is replaced.
  // `unverified` marks the replacements that are still a best guess.
  "apple-configurator-and-shortcuts": {
    name: "Apple Configurator והיישום 'קיצורים'",
    section: "Technical",
    questions: [
      { type: "single", match: "איזו מהפלטפורמות הבאות היא המתאימה ביותר לשימוש ב-Apple Configurator וביישום 'קיצורים'", answer: "Mac" },
      { type: "single", match: "מנהל מערכת מפתח זרימת עבודה ומחפש בה באגים באמצעות פעולות Configurator ביישום 'קיצורים'", answer: "איתור מכשירים מחוברים" },
      { type: "multiple", match: "ארגון מגדיר ומגדיר מחדש לעתים קרובות מכשירי iPhone ו-iPad לתרחישים שונים של שימוש משותף.", answers: ["שירות שמירת תוכן במטמון", "חיבור Ethernet במהירות גבוהה", "רכזת USB עם מספר יציאות USB"], unverified: true }
    ]
  },
  "mac-fundamentals-quiz": {
    name: "בוחן — היסודות של Mac",
    section: "Technical",
    questions: [
      { type: "multiple", match: "מה מהדברים הבאים נכון לגבי משתמשים רגילים?", answers: ["יכולים לשנות את ההגדרות שלהם", "יכולים להתקין יישומים"] },
      { type: "multiple", match: "FileVault מופעל ב-Mac. במה תוכלו להשתמש כדי לפתוח את הנעילה של כונן ההפעלה אם שכחתם את", answers: ["מפתח שחזור", "חשבון iCloud"] },
      { type: "multiple", match: "אילו מאפייני נגישוּת זמינים ב-macOS?", answers: ["דיבור", "ראייה"] },
      { type: "single", match: "איך יש להפעיל מחדש את ה-Mac?", answer: "יש להקליק על תפריט Apple, ואחר כך לבחור באפשרות 'הפעלה מחדש'." },
      { type: "single", match: "עליכם לבטל גישה של יישום לתיקיה 'מסמכים'. איזו הגדרת מערכת מאפשרת לכם לשנות את הגישה של", answer: "'פרטיות ואבטחה' > 'קבצים ותיקיות'" },
      { type: "multiple", match: "יישום הפסיק להגיב. איך תאכפו סיום מיידי של היישום?", answers: ["יש ללחוץ על Option-Command-Escape כדי לפתוח את החלון 'סיום מיידי', ואחר כך יש לבחור ביישום שאינו מגיב.", "יש להקליק על תפריט Apple, ואחר כך לבחור באפשרות 'סיום מיידי'."] },
      { type: "single", match: "איזה סוג של חשבון מאפשר לכם להשתמש ב-Mac באופן זמני מבלי ליצור שם משתמש וסיסמה?", answer: "אורח" },
      { type: "single", match: "ה-Mac מציג התראה לאחר ניסיון לפתוח יישום שהותקן מהאינטרנט. מה אתם חייבים לעשות כדי לאפשר", answer: "לבחור ב'הגדרות המערכת' > 'פרטיות ואבטחה', ואחר כך להקליק על 'פתיחה בכל זאת' מתחת ל'אבטחה'." },
      { type: "single", match: "אתם משתמשים ב-macOS Sonoma ואתם מוכנים להתקין את macOS Sequoia. איך תשדרגו את ה-Mac לגרסה", answer: "יש לפתוח את 'הגדרות המערכת', להקליק על 'כללי' ולאחר מכן להקליק על 'עדכון תוכנה'." },
      { type: "multiple", match: "כיצד תוכלו למצוא מידע נוסף על ציוד היקפי המחובר ל-Thunderbolt?", answers: ["יש לבחור ב'הגדרות המערכת' > 'כללי' > 'מידע', ואחר כך להקליק על 'נתוני המערכת'.", "יש לפתוח את Spotlight ולהקליד \"נתוני המערכת\" בשדה החיפוש."] }
    ]
  },
  "iphone-ipad-fundamentals-quiz": {
    name: "בוחן — יסודות ה—iPhone וה—iPad",
    section: "Technical",
    questions: [
      { type: "single", match: "כיצד אפשר לבדוק את השימוש בסוללה ב-iPhone שלכם?", answer: "עוברים אל 'הגדרות' > 'סוללה' כדי להציג מידע על השימוש בסוללה." },
      { type: "single", match: "איך מוסיפים חשבון לוח שנה ב-iPad?", answer: "עוברים ל'הגדרות' > 'יישומים' > 'לוח שנה' > 'חשבונות לוח שנה'." },
      { type: "single", match: "היכן ניתן לשנות את הגדרות המיקום של יישום?", answer: "'הגדרות' > 'פרטיות ואבטחה' > 'שירותי מיקום'" },
      { type: "single", match: "איך מסירים יישום?", answer: "נוגעים נגיעה ממושכת ביישום כדי לפתוח תפריט אפשרויות מהיר, ואחר כך בוחרים באפשרות 'הסרת היישום'." },
      { type: "single", match: "שטח האחסון ב-iPad Pro כמעט מלא. איך אפשר להציג את זמינות האחסון הכוללת ב-iPad?", answer: "עוברים אל 'הגדרות' > 'כללי' > 'אחסון ב-iPad'." },
      { type: "single", match: "איך יוצרים תיקייה לארגון יישומים ב-iPhone?", answer: "נוגעים נגיעה ממושכת ברקע של מסך הבית עד שהיישומים יתחילו להתנועע, ואז גוררים יישום על גבי יישום אחר." },
      { type: "single", match: "היכן מפעילים עדכוני תוכנה אוטומטיים?", answer: "'הגדרות' > 'כללי' > 'עדכון תוכנה'" },
      // The options are pictures with no text: this is the input value of the correct one.
      { type: "single", match: "איזה סמל בשורת המצב ב-iPhone מעיד שיישום משתמש בשירותי מיקום?", answer: "1408323" },
      // The server rejected "ראייה" (three attempts) and "תצוגה" (one). Only
      // "גודל המלל" and "חזות" are left; trying the likelier of the two.
      { type: "single", match: "איזו קטגוריית נגישות מכילה תכונות שמקלות על הצגת הטקסט ב-iPad?", answer: "גודל המלל", unverified: true },
      { type: "multiple", match: "עליכם להעביר את היישומים והמידע מה-iPhone הקודם ל-iPhone חדש. מה עליכם לעשות כדי להתחיל", answers: ["במכשיר הקודם, לעבור אל 'הגדרות'> 'כללי', להקיש על 'העברה או איפוס של ה-iPhone', ואחר כך לפעול לפי ההוראות שעל המסך.", "לקרב את שני המכשירים, ואחר כך לפעול לפי ההוראות שעל המסך."] }
    ]
  },
  "apple-account-icloud-fundamentals-quiz": {
    name: "בוחן — היסודות של חשבון Apple ו—iCloud",
    section: "Technical",
    questions: [
      { type: "multiple", match: "מה דרוש כדי להשבית את האפשרויות 'איתור' ו'נעילת ההפעלה'?", answers: ["קוד גישה למכשיר", "אישורי חשבון Apple"], unverified: true },
      { type: "multiple", match: "שכחתם את הסיסמה לחשבון Apple, אך באפשרותכם להשתמש באימות בשני גורמים. אילו מהבאים יכול", answers: ["מספר טלפון מהימן", "מכשיר Apple מהימן"] },
      { type: "multiple", match: "אילו פריטים מאוחסנים ב'סיסמאות של iCloud'?", answers: ["מפתחות התחברות", "שמות משתמשים וסיסמאות של Safari"] },
      { type: "single", match: "איזה מהבאים דרוש כדי שמאפייני 'המשכיות' יפעלו במכשירי Apple שלכם?", answer: "חשבון Apple" },
      { type: "single", match: "איזה יישום של iPad מכיל קבצים ותיקיות שסונכרנו מ-iCloud Drive?", answer: "היישום 'קבצים'" },
      { type: "single", match: "באיזה מאפיין של iCloud תוכלו להשתמש כדי לאתר iPhone שאבד?", answer: "איתור" },
      { type: "multiple", match: "מה דרוש כדי שיושלם 'גיבוי iCloud' אוטומטי ב-iPad?", answers: ["חיבור לרשת אלחוטית", "מכשיר המחובר לחשמל"] },
      { type: "single", match: "איזה מאפיין מאפשר לכם לסנכרן קבצים ותיקיות בין Mac ל-iPad?", answer: "iCloud Drive" }
    ]
  },
  // Sales Coach › Apple Professional Academy › חינוך › יצירת קשר עם מנהיגים
  // בממשל בתחום החינוך. Captured 2026-08-31; answers reasoned from the module,
  // never confirmed by a graded attempt yet.
  "connecting-with-education-government-leaders": {
    name: "בדקו את הידע שלכם – בנייית קשרים עם מנהיגים בממשל בתחום החינוך",
    section: "חינוך",
    questions: [
      { type: "single", match: "מגלה עניין בטכנולוגיית החינוך של Apple, אך מעלה חששות לגבי העלות", answer: "בקשת פגישה נוספת כדי להבין את סדר העדיפויות הדיגיטלי של ד\"ר בוהם ואת המצב של בעלי העניין.", unverified: true },
      // The five stages in page order: stakeholder map, vision workshop, TCO,
      // customer stories, tender review.
      { type: "selects", match: "התאמת הפעולות לשלב בניית הקשר", answers: ["חשיפת צורכי הלקוחות", "חזון", "הצגה", "השראה", "הצעת מחיר"], unverified: true },
      { type: "single", match: "במה כדאי להתמקד כדי להיות יעילים כשבונים קשרים עם גורמי ממשל", answer: "בניית מערכת יחסים מהימנה המפגינה את האמינות שלכם ואת ההבנה העמוקה של הצרכים של בעלי העניין.", unverified: true },
      { type: "multiple", match: "אילו מהאפשרויות הבאות הן הערכים של Apple", answers: ["סביבה", "אחריות ספקים", "פרטיות ואבטחה", "נגישות"], unverified: true },
      { type: "single", match: "חושש לגבי ניהול מכשירי Apple במערכת שכבר משתמשת", answer: "\"מכשירי Apple משתלבים בצורה חלקה עם הכלים של Microsoft ו-Google שבתי ספר רבים משתמשים בהם היום.\"", unverified: true },
      { type: "multiple", match: "את מי כדאי להזמין לסדנאות חזון", answers: ["מורים", "מנהיגי תוכנית הלימודים", "בעלי תקציב", "מדריכי מורים", "צוותי IT"], unverified: true },
      { type: "single", match: "שהיו להם בעבר בעיות בניהול מכשירים בבתי ספר רבים", answer: "הראו לו את מודל התמיכה והכלים לניהול מחזור החיים של Apple, כמו Apple School Manager.", unverified: true },
      { type: "multiple", match: "מהם המרכיבים של בניית קשרים אסטרטגיים", answers: ["ערך חשוב", "הצטרפות לשיחה בשלב מוקדם"], unverified: true },
      { type: "multiple", match: "כיצד תוכלו להשפיע על התנאים של RFP זה", answers: ["שיתוף סיפורי הצלחה של רכש והמלצות של לקוחות.", "מתן הנחיות בכתב מראש לגבי מפרטים טכניים שמדגישות את הערך הייחודי של Apple.", "בדיקות שוטפות כדי לטפל בחששות ובמחסומים."], unverified: true },
      { type: "multiple", match: "אילו מהפעולות הבאות עליכם לעשות כדי להשלים את השליחה", answers: ["הקמת צוות תגובה למכרז.", "עיון בדרישות המכרז."], unverified: true }
    ]
  },
  // Sales Coach › הכנה לפריסה מוצלחת של הפתרונות של Apple › יעדים, צוותים ותכנון
  // https://salescoach.apple.com/home/content/view/475616?backTo=%2Fhome%2Fcollection%2F225054
  // Scored 40% against a 70% threshold on 2026-08-31; the two confirmed answers
  // are the server's own. The rest are read off the feedback the graded page
  // printed next to each option ("נכון" / "לא נכון"), so they are unverified.
  "goals-teams-and-planning": {
    name: "יעדים, צוותים ותכנון",
    section: "הכנה לפריסה מוצלחת של הפתרונות של Apple",
    questions: [
      { type: "single", match: "מהו היתרון של פריסה בשלבים?", answer: "פריסה בשלבים מספקת את הזמן הנחוץ כדי להבטיח שהכול פועל בצורה חלקה" },
      { type: "multiple", match: "מה יכול השירות של שמירת תוכן במטמון ב-macOS לעשות כדי לשפר", answers: ["לאחסן יישומים מה-App Store במטמון", "לאחסן במטמון עדכונים ושדרוגים של מערכת ההפעלה"] },
      // "כרטיס SIM משולב" was rejected. Left: כרטיס SIM מוטבע | כרטיס Micro SIM | eSIM.
      { type: "single", match: "איזה סוג של SIM מאפשר לבצע מרחוק הקצאה של מכשירים מנוהלים", answer: "eSIM", unverified: true },
      // The feedback confirmed "שירותי פרוקסי או סינון תוכן" and ruled out
      // "מאיץ VPN"; ממסרי רשת is the remaining network-load answer.
      { type: "multiple", match: "ניתן להשתמש ב-MDM לניהול יעיל של כוח אדם בעבודה מרחוק", answers: ["שירותי פרוקסי או סינון תוכן", "ממסרי רשת"], unverified: true },
      // The feedback confirmed 6GHz and ruled out 7GHz ("not allocated to Wi-Fi").
      { type: "multiple", match: "אילו שני תדרי רדיו Wi-Fi הכי מתאימים לצפיפות גבוהה של לקוח", answers: ["6GHz", "5GHz"], unverified: true },
    ]
  },
  // Sales Coach › הערכים של Apple › הכירו את הערכים של Apple
  // https://salescoach.apple.com/home/content/view/291863?backTo=%2Fhome%2Fcollection%2F188872
  // Scored 0% against an 80% threshold on 2026-08-31. Nothing was confirmed, but
  // the graded page marked the environment and privacy options right and the
  // personalised-tracking option wrong, so that one is dropped and the
  // accessibility option — never tried — takes its place.
  "apple-values-knowledge-check": {
    name: "הכירו את הערכים של Apple",
    section: "הערכים של Apple",
    questions: [
      { type: "multiple", match: "כיצד Apple מיישמת את הערכים שלה בפועל?", answers: ["יצירת תוכנית שמטרתה להביא את Apple לניטרליות פחמנית בכל טביעת הרגל הגלובלית שלה עד 2030", "עיצוב מוצרי Apple כך שיגנו על פרטי הלקוחות", "בניית מאפייני נגישות במוצרי Apple ללא עלות נוספת"], unverified: true },
    ]
  },
  // Sales Coach › הכנה לפריסה מוצלחת של הפתרונות של Apple › הגדרת הפריסה שלכם
  // https://salescoach.apple.com/home/content/view/475619
  // Captured 2026-08-31; passing mark is 70%, so 5 of 6 must land. The one
  // attempt on record crashed before submission ("Target page ... has been
  // closed"), so nothing here has been graded — every answer is reasoned from
  // the module, not confirmed.
  "configuring-your-deployment": {
    name: "הגדרת הפריסה שלכם",
    section: "הכנה לפריסה מוצלחת של הפתרונות של Apple",
    questions: [
      // "מעקב GPS אוטומטי" is the obvious distractor; enrolment under ADE is
      // automatic, so "דרישה ממשתמשים" is the other one left out.
      { type: "multiple", match: "אילו הן שלוש תועלות של השימוש ב'הרשמה אוטומטית למכשיר' לצורך רישום מכשירים", answers: ["תצורה של אפס מגע עבור מנהלי מערכת ב-IT", "המכשיר נעצר בהפעלה אם הוא מאופס", "קביעת תצורה של מכשירים עם ההפעלה"], unverified: true },
      { type: "single", match: "מה משתמש צריך כדי לרשום את ה-iPhone האישי שלו לפתרון MDM של ארגון באמצעות רישום משתמש מבוסס חשבון", answer: "חשבון Apple מנוהל", unverified: true },
      // The separate volume exists to keep managed data apart; its key is
      // destroyed on unenrolment. "מגן על נתונים ארגוניים" is the stated purpose,
      // with "מחיקה מאובטחת" the consequence — that is the likelier trap.
      { type: "single", match: "מה המטרה של אמצעי האחסון הנפרד בהצפנה שנוצר כאשר מכשיר נרשם באמצעות רישום משתמשים מבוסס חשבון", answer: "הוא מגן על נתונים ארגוניים.", unverified: true },
      { type: "single", match: "איזו תועלת עיקרית יש ל-Apple Business Manager", answer: "הרשמה אוטומטית למכשיר ב-MDM", unverified: true },
      { type: "multiple", match: "מהן שתי תועלות עיקריות למשתמשים בהתייחסות של Apple לניהול מכשירים", answers: ["התהליך קל למשתמש.", "הניהול הוא שקוף."], unverified: true },
      { type: "single", match: "במה משתמש MDM כדי להתריע למכשירים על פקודות או פרופילים זמינים", answer: "MDM משתמש בשירות העדכונים בטכנולוגיית Push של Apple\u200f (APNs).", unverified: true },
    ]
  },
  // Sales Coach › הכנה לפריסה מוצלחת של הפתרונות של Apple › בחירת פתרון MDM
  // https://salescoach.apple.com/home/content/view/475854
  // Captured 2026-08-31; passing mark is 70% over 3 questions, so all three have
  // to land. Never graded — answers reasoned from the module, not confirmed.
  "choosing-an-mdm-solution": {
    name: "בחירת פתרון MDM",
    section: "הכנה לפריסה מוצלחת של הפתרונות של Apple",
    questions: [
      // The other three all assert a ranking Apple does not make: identical
      // solutions, preferential APNs access, or closeness to Apple as performance.
      { type: "single", match: "איזה מהמשפטים הבאים לגבי בחירת פתרון MDM הוא נכון", answer: "ספקי MDM נבדלים אלה מאלה בהתייחסותם לארכיטקטורה מארחת, לקונסולות ניהול, לתהליכי עבודה ולדיווח.", unverified: true },
      // Four of the five read as plausible. "איזה פתרון MDM מומלץ ביותר על ידי
      // Apple" is out because Apple endorses no vendor; the legacy-vs-new device
      // split is the second one left out, day-zero support being the canonical
      // third question.
      { type: "multiple", match: "אילו שלוש שאלות עיקריות צריכות לסייע לשיקולים שלכם בבחירת פתרון MDM", answers: ["כמה מכשירים ינוהלו?", "מהן היכולות של המכשירים שברצונכם לנהל?", "האם פתרון ה-MDM יהיה תואם למהדורות חומרה ותוכנה עתידיות של Apple?"], unverified: true },
      // MDM does not back up user content, and automatic enrolment belongs to
      // Apple Business Manager rather than to the MDM solution.
      { type: "multiple", match: "אילו שלוש יכולות יש לפתרונות MDM", answers: ["בדיקת מכשירים לגבי תאימות וסטטוס מול מדיניות.", "הפצת יישומים וספרים למכשירים או למשתמשים.", "קביעה ועדכון של ההגדרות וההגבלות של המכשיר."], unverified: true },
    ]
  },
  // Sales Coach › מוצרי למידה › מוסיפים רגעי "וואו" להדגמות של iPad
  // https://salescoach.apple.com/home/content/view/488558
  // Confirmed 2026-08-31 by a hand attempt that scored 100%.
  "ipad-demo-wow-moments": {
    name: "מוסיפים רגעי \"וואו\" להדגמות של iPad",
    section: "מוצרי למידה",
    questions: [
      { type: "multiple", match: "מה תוכלו לעשות כדי ליצור הזדמנויות נוספות לרגעי", answers: ["להעביר הדגמה קצרה כדי למשוך את תשומת הלב של הלקוחות", "להעביר הדגמות שמתייחסות לשגרת היומיום של הלקוחות", "להדגיש בהדגמות את מה שהופך את חוויית השימוש ב-iPad לייחודית"] }
    ]
  },
  // Sales Coach › הרחבת הזדמנויות המכירה על ידי צירוף Apple Professional Learning
  // https://salescoach.apple.com/home/content/view/489333
  // Confirmed 2026-08-31 by a hand attempt that scored 100% (passing mark 80%).
  // NOTE: the quiz has a sixth question — a "התאימו כל שירות" matching exercise
  // for the APL first-year plan — that the capture does not record, because it
  // uses neither radios, checkboxes nor selects. Filling only these five leaves
  // it unanswered and the player will refuse the submission.
  "apl-sales-opportunities-quiz": {
    name: "בוחן – הרחבת הזדמנויות המכירה על ידי צירוף APL",
    section: "הרחבת הזדמנויות המכירה על ידי צירוף Apple Professional Learning",
    questions: [
      { type: "single", match: "מהו האתגר העיקרי של GoodWill Primary School ביוזמת ה-iPad שלו", answer: "למורים חסרה ההדרכה לשילוב יעיל של iPad בהוראת כתיבה ותכנות." },
      { type: "multiple", match: "מה עליכם לומר למנהל בית הספר על תוכנית Apple Professional Learning", answers: ["\"Apple Professional Learning מציעה חוויה אישית, פרקטית ומעוררת השראה.\"", "\"ניתן להשתתף בחוויות Apple Professional Learning באופן אישי או מקוון.\""] },
      { type: "single", match: "איזו טעות מרכזית תרמה ככל הנראה לקושי במדידת ההשפעה", answer: "בית הספר מסתמך על סדנאות בהנחיית עמיתים ללא תוכנית למידה מקצועית מובנית." },
      { type: "single", match: "מהי הדרך היעילה ביותר שבה מנהל בית הספר יוכל להבטיח תשואה גבוהה", answer: "עליו להשקיע בפיתוח מקצועי שיסייע למורים למצות את מלוא הפוטנציאל של שילוב הטכנולוגיה בלמידה." },
      { type: "single", match: "כיצד מומחי Apple Professional Learning יכולים לעזור למורים להתקדם", answer: "מומחים יכולים להציג אסטרטגיות מעשיות המותאמות לתוכנית הלימודים, כדי לקדם שימוש יעיל ב-iPad בהוראה." }
    ]
  },
  // Sales Coach › התכונות הבסיסיות של iPad › iPad Pro ‒ מבט ראשון
  // https://salescoach.apple.com/home/content/view/505226
  // Confirmed 2026-08-31 by a hand attempt that scored 100%. The three rejected
  // options belong to other silicon: ProMotion, the N1 chip and the LiDAR scanner.
  "ipad-pro-first-look": {
    name: "iPad Pro ‒ מבט ראשון",
    section: "התכונות הבסיסיות של iPad",
    questions: [
      { type: "multiple", match: "איזה מהמאפיינים הלקוחות מקבלים בזכות שבב M5 ב-iPad Pro", answers: ["חיסכון בצריכת חשמל לחיי סוללה שמספיקים לכל היום", "רוחב פס זיכרון מהיר יותר", "ביצועים טובים יותר למשימות AI"] }
    ]
  },
  // Sales Coach › התכונות הבסיסיות של iPad › iPad Air – מבט ראשון
  // https://salescoach.apple.com/home/content/view/519041
  // Confirmed 2026-08-31 by a hand attempt that scored 100%.
  "ipad-air-first-look": {
    name: "iPad Air – מבט ראשון",
    section: "התכונות הבסיסיות של iPad",
    questions: [
      { type: "multiple", match: "אילו מהמשפטים נכון לומר על ה-iPad Air החדש", answers: ["ה-iPad Air תואם ל-Apple Pencil Pro או ל-Apple Pencil (בחיבור USB-C).", "הוא מופעל באמצעות שבב M4."] }
    ]
  },
  // Sales Coach › התכונות הבסיסיות של Mac › Mac מוביל את הדרך ב-AI
  // https://salescoach.apple.com/home/content/view/520478
  // This one is a POLL, not a quiz: it has no passing mark and the capture shows
  // every option carrying correctAnswer: false. Any pick completes it, so the
  // answer below is arbitrary and does not need confirming.
  "mac-leads-on-ai-poll": {
    name: "Mac מוביל את הדרך ב-AI",
    section: "התכונות הבסיסיות של Mac",
    questions: [
      { type: "single", match: "לאיזו פעולה הבינה מלאכותית ב-Mac הכי מועילה לכם", answer: "חיפוש ועריכה של תמונות וסרטונים" }
    ]
  },
  // Sales Coach › התכונות הבסיסיות של Mac › MacBook Air – מבט ראשון
  // https://salescoach.apple.com/home/content/view/519429
  // Confirmed 2026-08-31 by a hand attempt that scored 100%. Q2 is false: the
  // new MacBook Air goes up to 4TB, not 512GB.
  "macbook-air-first-look": {
    name: "MacBook Air – מבט ראשון",
    section: "התכונות הבסיסיות של Mac",
    questions: [
      { type: "single", match: "שבב M5 ב-MacBook Air כולל מעבד גרפי מהדור הבא", answer: "נכון" },
      { type: "single", match: "ב-MacBook Air, הלקוחות יכולים לקבל אחסון מהיר בנפח של עד 512GB", answer: "לא נכון" }
    ]
  },
  // Sales Coach › התכונות הבסיסיות של Mac › MacBook Pro – מבט ראשון
  // https://salescoach.apple.com/home/content/view/520307
  // Confirmed 2026-08-31 by a hand attempt that scored 100%.
  "macbook-pro-first-look": {
    name: "MacBook Pro – מבט ראשון",
    section: "התכונות הבסיסיות של Mac",
    questions: [
      { type: "single", match: "השבב M5 Max הוא השבב המתקדם ביותר של Apple שנבנה אי פעם", answer: "נכון" }
    ]
  },
  // Confirmed by Sales Coach grading in the 2026-09-01 learned-answer export.
  "iphone-17-מבט-ראשון": {
    name: "iPhone 17 – מבט ראשון",
    section: "התכונות הבסיסיות של iPhone",
    questions: [
      { type: "single", match: "ל‐iPhone 17 יש צג שפועל תמיד עם ProMotion", answer: "נכון" },
      { type: "multiple", match: "אילו מהמשפטים על העיצוב של iPhone 17 נכונים", answers: ["הוא מגיע בצבעים שחור, לבן, מרווה, כחול-ערפל ולבנדר.", "יש לו צג גדול יותר בגודל 6.3 אינץ' עם גבולות דקים יותר."] }
    ]
  },
  "iphone-17e-מבט-ראשון": {
    name: "iPhone 17e – מבט ראשון",
    section: "התכונות הבסיסיות של iPhone",
    questions: [
      { type: "multiple", match: "מה עליכם לומר ללקוחות על העמידות של iPhone 17e", answers: ["\"המסך עמיד פי שלושה יותר בפני שריטות לעומת iPhone 16e.\"", "\"חזית ה-Ceramic Shield 2 קשיחה יותר מכל זכוכית אחרת בטלפונים חכמים.\""] },
      { type: "single", match: "לקוחות מקבלים חיי סוללה שמספיקים לכל היום", answer: "נכון" }
    ]
  },
  "iphone-air-מבט-ראשון": {
    name: "iPhone Air – מבט ראשון",
    section: "התכונות הבסיסיות של iPhone",
    questions: [
      { type: "single", match: "iPhone Air מופעל באמצעות שבב A19", answer: "לא נכון" },
      { type: "multiple", match: "מה עליכם לומר ללקוחות על העיצוב של iPhone Air", answers: ["\"זה ה‐iPhone הדק ביותר אי‐פעם, כך שהוא נראה ומרגיש נהדר בידיים שלכם.\"", "\"יש לו Ceramic Shield 2 בחזית ו-Ceramic Shield מאחור, כך שהוא עמיד יותר מכל iPhone קודם.\"", "\"הוא עשוי מטיטניום בדרגה 5, כך שהוא חזק וקל.\""] }
    ]
  },
  // Sales Coach › התחילו למכור מכשירי iPad › בוחן – התחילו למכור מכשירי iPad
  // https://salescoach.apple.com/home/content/view/521862?backTo=%2Fhome%2Fcollection%2F211852
  // Ten questions. The attempt captured on 2026-09-02 lost four: all three
  // matching questions, which nothing had ever answered, and the Magic Keyboard
  // one. The other six are answers the server has marked right.
  "בוחן-התחילו-למכור-מכשירי-ipad": {
    name: "בוחן – התחילו למכור מכשירי iPad",
    section: "התחילו למכור מכשירי iPad",
    questions: [
      // Widgets on the Home and Lock Screen; Stage Manager for multitasking with
      // recent apps down the side of the screen (the right, in a mirrored
      // right-to-left layout); Control Center for brightness, text size,
      // accessibility and the wireless network. The menu bar and the Dock are
      // the decoys — and if this comes back wrong, the Dock is what to try in
      // blank 2, since Apple describes recent apps as sitting on the right of
      // the Dock itself.
      { type: "selects", match: "איך כדאי לתאר ללקוחות כל אחד מהמאפיינים של iPadOS? יש להשל", answers: ["וידג'טים", "מנהל התצוגה", "מרכז הבקרה"] },
      { type: "multiple", match: "מה צריך לספר ללקוחות על ההגדרה של תוכנית נתונים סלולריים ב", answers: ["\"אפשר לרכוש תוכנית ישירות ב-iPad.\"", "\"אפשר לשלם בהתאם לצורך, כך שלא תצטרכו להתחייב לחוזה ארוך טווח.\"", "\"אפשר לבחור תוכניות לפי כמות הנתונים הדרושה לך.\""] },
      { type: "single", match: "אילו דגמי Apple Pencil תואמים ל-iPad Air? יש לבחור אפשרות", answer: "Apple Pencil Pro ו-Apple Pencil ‏(USB-C)" },
      // The Magic Keyboard is made for iPad Pro and iPad Air. The base iPad takes
      // the Magic Keyboard Folio instead — which is what the option says when it
      // is graded — and the mini takes neither. Confirmed by the server.
      { type: "multiple", match: "אילו דגמי iPad תואמים ל-Magic Keyboard? נבחרו 2 מתוך 2.", answers: ["iPad Pro", "iPad Air"] },
      { type: "multiple", match: "מה עליכם לומר על השבבים מסדרה M ב-iPad? נבחרו 3 מתוך 3.", answers: ["\"תבחינו בכך שהכול מהיר וזורם הודות לזיכרון האחיד.\"", "\"תקבלו גרפיקה מהירה, כך שהם מצוינים עבור משחקים ומשימות יצירתיות.\"", "\"תיהנו מאותה רמת ביצועים, לא משנה אם ה-iPad מחובר לחשמל או אם הוא פועל באמצעות סוללה.\""] },
      { type: "single", match: "מה כדאי לומר ללקוחות על ה-iPad Air? יש לבחור אפשרות אחת.", answer: "\"עם המצלמה הקדמית הממוקמת בקצה הרחב ו'מרכז הבמה', ועם 'הפרדת קול' במיקרופונים, תיראו ותישמעו נהדר בשיחות וידאו.\"" },
      { type: "single", match: "על מה עליכם להמליץ ללקוחות שזקוקים למתאם מתח וכבל נוספים כ", answer: "מתאם מתח USB-C בהספק 20 ואט של Apple וכבל טעינה USB-C של Apple" },
      // Notes is what marks up PDFs, fills forms and scans documents; Freeform is
      // the real-time collaborative canvas; window tiling is what puts two apps
      // on screen at once. The Lock Screen and the contact poster are decoys.
      { type: "selects", match: "התאימו את צורכי הלקוחות למאפיין של iPadOS שכדאי לספר להם ע", answers: ["פתקים", "Freeform", "סידור חלונות"] },
      { type: "multiple", match: "מה כדאי לומר על ה-iPad Pro? נבחרו 3 מתוך 3.", answers: ["\"עם מערכת המצלמות המקצועית, תוכלו לצלם תמונות יפות וסרטוני ProRes מפורטים באיכות 4K.\"", "\"יש לו צג Ultra Retina XDR, כך שתקבלו צג בהיר, תמונות מפורטות וגוני שחור נאמנים יותר למציאות.\"", "\"תקבלו זיכרון רב יותר שיאפשר ריבוי משימות ועוצמה שתספיק ליישומים ולמשחקים תובעניים.\""] },
      // Touch ID with two sizes and four finishes is the Air; the 11-inch with
      // the 12MP landscape Center Stage camera is the plain iPad; M5 with Face
      // ID, Thunderbolt and LiDAR is the Pro; 8.3 inches with the Pencil on the
      // side is the mini.
      { type: "selects", match: "התאימו בין כל דגם iPad לבין המאפיינים שלו. יש להשלים את הח", answers: ["iPad Air", "iPad", "iPad Pro", "iPad mini"] },
    ]
  },
  // Sales Coach › התחילו למכור iPhone › בוחן – התחילו למכור מכשירי iPhone
  // https://salescoach.apple.com/home/content/view/521884?backTo=%2Fhome%2Fcollection%2F208920
  // Scored 80% on 2026-09-02; the two it lost are the matching questions below,
  // which had never been answered. Everything else here the server has marked
  // right, the model-matching question included.
  "בוחן-התחילו-למכור-מכשירי-iphone": {
    name: "בוחן – התחילו למכור מכשירי iPhone",
    section: "התחילו למכור iPhone",
    questions: [
      // Lock Screen customisation (widgets, wallpaper, text colour and font),
      // iMessage for end-to-end encrypted messages with backgrounds and polls,
      // VoiceOver for hearing what is on screen, and Detection Mode — the
      // Magnifier feature that uses the LiDAR scanner. Home Screen and Dictation
      // are the decoys.
      { type: "selects", match: "התאימו כל מאפיין של iOS לתיאור שלו. יש להשלים את החסר.", answers: ["מסך הנעילה", "iMessage", "VoiceOver", "מצב זיהוי"] },
      { type: "multiple", match: "אילו אמירות נכונות לגבי מצלמת Center Stage הקדמית? נבחרו 2", answers: ["הלקוחות יכולים להשתמש במאפיין 'צילום כפול' כדי להקליט בו-זמנית את עצמם ואת העולם שסביבם.", "היא מעולה למסגור של תמונות סלפי קבוצתיות ושל סרטונים."] },
      { type: "multiple", match: "אילו סוגי פעולות יכולים הלקוחות לעשות עם iCloud? נבחרו 2 מ", answers: ["לשמור את התכנים והנתונים שלהם במצב עדכני בכל המכשירים שלהם", "לשמור מצגת Keynote ולהזמין משתמשים אחרים לערוך אותה ביחד"] },
      { type: "multiple", match: "במה יכולים הלקוחות להשתמש כדי לטעון מכשירי iPhone 17 ו-iPh", answers: ["מטען אלחוטי בתקן Qi2", "מטען MagSafe", "מתאם מתח וכבל בחיבור USB-C"] },
      { type: "single", match: "כיצד עליכם לתאר ללקוחות את מצב 'קולנועי'? יש לבחור אפשרות", answer: "\"מצב זה יוצר באופן אוטומטי מעברי מיקוד ואפקטים של עומק שדה.\"" },
      { type: "multiple", match: "מה עליכם לומר ללקוחות על ה-iPhone 17 Pro? נבחרו 2 מתוך 2.", answers: ["\"העיצוב שלו עשוי גוף אלומיניום אחיד (unibody) שממקסם את הביצועים, את קיבולת הסוללה ואת העמידות.\"", "\"השבב A19 Pro מספק מהירות ויעילות יוצאות מהכלל, וזה מושלם למשחקים מתקדמים ולמשימות תובעניות.\""] },
      { type: "multiple", match: "מה עליכם לומר על המצלמות ב-iPhone 17? נבחרו 2 מתוך 2.", answers: ["\"הודות למערכת המצלמות Dual Fusion ברזולוציה של 48MP, תהיה לך אפשרות לצלם תמונות מדהימות עם פרטים מהממים.\"", "\"יש לו מצלמת Center Stage קדמית ברזולוציה של 18MP לצילום וידאו יציב במיוחד.\""] },
      // The four Continuity features, each by what it does: AirDrop sends files
      // to nearby devices, Handoff carries a task to another device, Universal
      // Clipboard copies between two devices, Continuity Camera makes the iPhone
      // a webcam for the Mac. AirPlay is the decoy.
      { type: "selects", match: "התאימו כל מאפיין של iPhone לתיאור שלו. יש להשלים את החסר.", answers: ["AirDrop", "Handoff", "לוח אוניברסלי", "המשכיות במצלמה"] },
      // Confirmed: 6.3" aluminium in five colours with A19 is the 17; 6.5"
      // titanium and the thinnest ever is the Air; 6.3" unibody with A19 Pro is
      // the 17 Pro; 6.1" with A19 is the 17e.
      { type: "selects", match: "התאימו כל דגם של iPhone למאפיינים שלו. יש להשלים את החסר.", answers: ["iPhone 17", "iPhone Air", "iPhone 17 Pro", "iPhone 17e"] },
      { type: "single", match: "איזה מאפיין יכול ליידע את שירותי החירום ואת אנשי הקשר לשעת", answer: "זיהוי תאונת דרכים" },
    ]
  },
  // Sales Coach › ה-Ecosystem של Apple › מה אתם יודעים על ה-Ecosystem של Apple?
  // https://salescoach.apple.com/home/content/view/488387
  // Scored 40% on 2026-09-02. The product knowledge all landed — Universal
  // Clipboard, Universal Control, the Watch Live Activity, and Double Tap —
  // and every episode-detail question missed, which is what `unverified` was
  // saying. Each of those is now one option lighter: the grade ruled out the
  // first guess, so what is written below is the second, and they are still
  // guesses. Anyone who watches the four episodes can settle all five in a
  // couple of minutes and save the attempts.
  //
  // The step-ordering question is a different matter: its answer looks right
  // and the fill was what broke, putting the steps back almost exactly
  // reversed. Ordering dropdowns move each other, so runner.js now reads the
  // fill back and repairs it until it stands.
  "מה-אתם-יודעים-על-ה-ecosystem-של-apple": {
    name: "מה אתם יודעים על ה-Ecosystem של Apple?",
    section: "ה-Ecosystem של Apple",
    questions: [
      // iMessage was the reading — Announce Notifications reads a message out and
      // takes a hands-free reply — and the grade rejected it. Mail is next: the
      // notification is about her promotion, which is the kind of news that
      // arrives by email.
      { type: "single", match: "Siri יכולה לקרוא את העדכונים הנכנסים והמשתמשים יכולים להגי", answer: "דואר", unverified: true },
      // Universal Control is a Mac-and-iPad feature; it does not reach iPhone or Watch.
      { type: "multiple", match: "בין אילו מכשירי Apple 'שליטה אוניברסלית’ פועלת? יש לבחור א", answers: ["iPad", "Mac"] },
      // The Apple Support app was rejected; the website is the next likeliest
      // place Riley would send him to read about Sidecar.
      { type: "single", match: "‘התמיכה של Apple מעניקה למשתמשים את העזרה שהם צריכים בנוגע", answer: "אתר", unverified: true },
      // Scanning a recipe in Notes, in order: open Notes, make a new note, tap the
      // paperclip, hold the page in front of the camera, scan it, save. The rows
      // are in the order the page lists them, so each one is given its place.
      // Unchanged after the 40% attempt: the answer was never really tried,
      // because setting one row's position reorders the rest and the fill left
      // the steps almost exactly reversed.
      { type: "selects", match: "סבתא משתמשת ב-iPad כדי לסרוק את המתכון ולשלוח אותו לריילי.", answers: ["מיקום ההזמנה: 4 מתוך 6", "מיקום ההזמנה: 5 מתוך 6", "מיקום ההזמנה: 1 מתוך 6", "מיקום ההזמנה: 3 מתוך 6", "מיקום ההזמנה: 6 מתוך 6", "מיקום ההזמנה: 2 מתוך 6"] },
      // Hearts was rejected. The call is about a promotion, so of what is left
      // — balloons, confetti, fireworks — confetti is the celebration one.
      { type: "single", match: "‘תגובות’ מאפשרות למשתמשים להביע את מה שהם מרגישים בשיחות ו", answer: "קונפטי", unverified: true },
      // Three was rejected; 2, 4 and 5 remain, and only the episode says which.
      { type: "single", match: "כמה אוכמניות יש בבסיס של העוגה של סבתא? יש לבחור אפשרות אח", answer: "4", unverified: true },
      // Guinevere was rejected; Genevieve, Gwendolyn and Gwyneth remain.
      { type: "single", match: "איך קוראים לסבתא של ריילי? יש לבחור אפשרות אחת.", answer: "גוונדולין", unverified: true },
      // Double Tap, the Apple Watch gesture the episodes are there to show off.
      // Confirmed by the grade.
      { type: "single", match: "איך איליי השתיק את הספירה לאחור לבישול שהגדיר אצלו ב-iPhon", answer: "במחוות ההצמדה הכפולה ב-Apple Watch" },
      // Starting a workout on the Watch does put a Live Activity on the iPhone.
      { type: "single", match: "כשמתחילים אימון אופניים ב-Apple Watch, אפשר גם לראות את מד", answer: "נכון" },
      { type: "single", match: "איזו תכונה מאפשרת למשתמשים להעתיק ולהדביק פריטים כמו תמונו", answer: "לוח אוניברסלי" },
    ]
  },
  "מידע-על-המחויבות-של-apple-לכדור-הארץ": {
    name: "מידע על המחויבות של Apple לכדור הארץ",
    section: "Apple",
    questions: [
      { type: "multiple", match: "לאילו מחויבויות סביבתיות התחייבה Apple", answers: ["להשקיע בפתרונות שמבוססים על הטבע", "שימוש בחומרים ממוחזרים", "הסרת פלסטיק מהאריזה"] }
    ]
  },
  "שתפו-את-הסיבות-האלו-לרכישת-iphone-17e-עוד-היום": {
    name: "שתפו את הסיבות האלו לרכישת iPhone 17e עוד היום",
    section: "התכונות הבסיסיות של iPhone",
    questions: [
      { type: "selects", match: "התאימו את המאפיינים הבאים של iPhone 17e לצורך של לקוחות", answers: ["שבב A19", "חזית Ceramic Shield 2", "מצלמת Fusion ברזולוציה של 48MP", "תמיכה ב-MagSafe"] }
    ]
  },
  "iphone-17-pro-מבט-ראשון": {
    name: "iPhone 17 Pro – מבט ראשון",
    section: "התכונות הבסיסיות של iPhone",
    questions: [
      { type: "single", match: "כמה מצלמות Fusion ברזולוציה של 48MP יש בדגמי iPhone 17 Pro", answer: "שלושה" }
    ]
  },
  // Sales Coach › הערכים של Apple › כמה ידוע לכם על הערכים של Apple?
  // https://salescoach.apple.com/home/content/view/424608?backTo=%2Fhome%2Fcollection%2F188872
  // Fourteen questions, and the threshold is 100%: every one of them has to
  // land. A 71% attempt (10 of 14) lost questions 1, 3, 4, 9 and 14; the
  // answers reasoned out for them took the next attempt to 93%, and the graded
  // response confirms 1, 3, 4 and 14. Thirteen of the fourteen are now answers
  // the server has marked right. The last one is question 9, and it was never
  // actually tried: findQuestionBlock handed the fill the whole quiz instead of
  // that question, so its answer was aimed at question 4's dropdowns, failed to
  // match, and left the blanks on the previous attempt. That is fixed in
  // runner.js, and the attempt after it filled question 9 properly and still
  // came back 93%: the fill is right, the answer was not. See the note on that
  // question for what the server has ruled out and what moved.
  "כמה-ידוע-לכם-על-הערכים-של-apple": {
    name: "כמה ידוע לכם על הערכים של Apple?",
    section: "הערכים של Apple",
    questions: [
      // Six options, and the question itself says five of them are categories,
      // so exactly one is the odd one out. The set that dropped "תנועה" and
      // kept "מוטוריקה" was graded wrong, which left only the other reading —
      // and the server has since confirmed it: this package's five categories
      // are ראייה, שמיעה, תנועה, דיבור and קוגניציה, and "מוטוריקה" is the
      // distractor.
      { type: "multiple", match: "המוצרים והשירותים של Apple כוללים תכונות נגישות מובנות. מהן", answers: ["ראייה", "שמיעה", "תנועה", "דיבור", "קוגניציה"] },
      { type: "single", match: "איזו תכונת נגישות של iPhone מאפשרת ללקוחות ליצור מחדש את ה", answer: "קול אישי" },
      // "Select all that apply" over four options, and the obvious reading —
      // the three that are plainly Apple initiatives, with the open beta
      // programme left out as the decoy — was graded wrong. Question 7 below is
      // the same shape and its answer is all four, and the beta statement is
      // not actually false of Apple: its beta programme is open to anyone who
      // signs up and Feedback Assistant is how that feedback comes back. All
      // four, and the server has confirmed it.
      { type: "multiple", match: "אילו יוזמות נוקטת Apple כדי להבטיח שמוצרים תוכננו כך שיענו ע", answers: ["שיתוף פעולה עם אנשים ממגוון קהילות רחב של בעלי מוגבלויות.", "עבודה עם עמותות, ארגונים קהילתיים וארגוני תקנים בינלאומיים.", "העסקת אנשים בעלי מוגבלויות.", "מקבלת את כל המשתמשים המבקשים להשתתף בבדיקות בטא ולספק משוב."] },
      // Four sentences, four initiatives, in the order the dropdowns appear:
      //   1 "משאבי למידה מקצועיים כמו ___"            → Apple Education Community,
      //     which is exactly what that is: Apple's professional-learning hub.
      //   2 "___ מציעה תוכניות שיעזרו לאנשי מקצוע לרכוש מיומנויות חדשות כדי
      //     שיוכלו לחפש הזדמנויות קריירה אחרות"       → Apple Developer Academy,
      //     the programme that teaches app skills for a career change.
      //   3 "___ ... לקהילות שסובלות מתת-ייצוג בתחום הטכנולוגיה"
      //                                               → Community Education
      //     Initiative, whose own description is coding, creativity and career
      //     opportunity for communities underrepresented in tech.
      //   4 "תוכניות כמו ___ נועדו לזהות את האנשים המובילים בשילוב טכנולוגיה
      //     בהוראה"                                   → Apple Distinguished Educators.
      // Sentences 3 and 4 are near-verbatim Apple copy, sentence 1 names the
      // resource outright, and 2 is what is left. Confirmed by the server on
      // the 93% attempt — which also settles what the answer memory was saying:
      // it had all 24 orderings of these four recorded as rejected, including
      // this one. The player tears a drag-and-drop question down to plain text
      // once it is graded, so what gets filed against one is what the fill
      // *intended* rather than what was submitted, and for this question that
      // record is worthless. Those entries have been dropped from
      // answer-memory.json so the blind fill cannot rule this out again.
      { type: "selects", match: "Apple מחויבת לספק לאנשים ברחבי העולם יותר הזדמנויות ללמידה", answers: ["Apple Education Community", "Apple Developer Academy", "Community Education Initiative", "Apple Distinguished Educators"] },
      // Apple 2030 is net zero across the supply chain and product life, and
      // Apple's own corporate operations have been carbon neutral since 2020.
      // The 50%-against-2015 figure is wrong (it is 75%), and no product is yet
      // made only of recycled and renewable material — that is the goal.
      { type: "multiple", match: "אילו מהמשפטים הבאים נכונים לגבי המחויבות של Apple למטרות סבי", answers: ["החזון של Apple לשנת 2030 הוא להוריד את פליטות הנטו של פחמן לאפס בכל שרשרת האספקה שלה ובכל תקופת השימוש במכשירי Apple.", "הפעילות הארגונית הגלובלית של Apple כבר מתאפיינת באפס פליטות נטו של פחמן."] },
      { type: "single", match: "Apple קבעה שלושה עמודי תווך אסטרטגיים שיש להתמקד בהם", answer: "כימיה חכמה יותר" },
      // Four options, four things Apple reports doing; graded right as a set.
      { type: "multiple", match: "אילו פעולות נוקטת Apple, המעידות על המחויבות שלה להכללה וגיו", answers: ["התחשבות במשוב של העובדים, הגברת קולות של אנשים הסובלים מתת-ייצוג ונקיטת פעולה.", "הטמעת תוכניות, תהליכים ומשאבים שנועדו לתמוך בכל העובדים.", "סיוע למנהיגים לנקוט גישה שוויונית לזיהוי מנהיגים עתידיים.", "הגדלת מספר המנהלים מקהילות הסובלות מתת-ייצוג."] },
      { type: "single", match: "Apple לא שואלת על היסטוריית השכר במסגרת תהליך הגיוס", answer: "נכון" },
      // Three blanks, six options, so three of them are decoys — and they come
      // in pairs, each answer shadowed by a near-miss. Apple's own inclusion
      // pages write these two sentences almost word for word: "Since 2017,
      // Apple has achieved and maintained gender pay equity globally", and the
      // Diversity Network Associations are the employee-led groups it says have
      // offered community and connection for more than 35 years. So:
      //   1 "מאז 2017, Apple השיגה ___"                    → שוויון שכר מגדרי
      //     (not the bare "שוויון בשכר": the claim Apple makes worldwide is the
      //     gender one, and the bare version was submitted and graded wrong)
      //   2 "...והיא שומרת עליו עבור ___ שלה ברחבי העולם"  → העובדים (not מנהלים:
      //     Apple maintains it for its people, and only "employees" reads)
      //   3 "עובדי Apple מוצאים להם קהילה וקשרים באיגודי ___ של Apple"
      //     → Diversity Network Association, which is the actual name of those
      //     employee groups; "תוכניות 'הכללה וגיוון'" is the shadow of it.
      // Two assignments are ruled out by the server itself rather than by the
      // unreliable drag-and-drop log: "שוויון בשכר / שוויון שכר מגדרי / תוכניות"
      // and "שוויון בשכר / העובדים / Diversity Network Association". Blanks 2
      // and 3 survive both, so blank 1 is what moves. If this is still wrong,
      // blank 3 is the next thing to doubt — "העובדים" there ("באיגודי העובדים
      // של Apple") with "שוויון בשכר" back in blank 1.
      { type: "selects", match: "השלימו את המשפטים הבאים בפעולות הנכונות בנושא 'הכללה וגיוון'", answers: ["שוויון שכר מגדרי", "העובדים", "Diversity Network Association"] },
      // Privacy as a fundamental human right, features built not to need the
      // data, and the user deciding what is shared: all three are Apple's own
      // wording of its privacy approach.
      { type: "multiple", match: "אילו מהמשפטים הבאים נכונים לגבי הגישה של Apple לפרטיות", answers: ["Apple מאמינה שפרטיות היא אחת מזכויות היסוד של בני אדם.", "היישומים 'מפות' ו'בריאות' נועדו לספק תכונות ליבה בלי לאסוף נתונים אישיים או להשתמש בהם.", "המשתמשים יכולים לקבוע ב'הגדרות' איזה מידע ישותף ואיפה הוא ישותף."] },
      // Apple states the reason for the collection in the app, at the moment it
      // asks; it does not email the Apple ID about it.
      { type: "single", match: "כאשר Apple צריכה לאסוף נתונים אישיים כדי להפעיל שירות", answer: "לא נכון" },
      // The three pillars of the Racial Equity and Justice Initiative;
      // engineering is not one of them.
      { type: "multiple", match: "Apple התחייבה לתמוך בפרויקטים בשלושה תחומים בעלי עדיפות שבהם", answers: ["חינוך", "העצמה כלכלית", "רפורמה בצדק הפלילי"] },
      { type: "single", match: "Apple רואה בכל גורם שמספק לה מוצרים, שירותים או עבודה, כחלק", answer: "נכון" },
      // The leadership and learning opportunities and the health and safety
      // standards were graded wrong as a pair, so the set is larger. The
      // remaining candidate is the supplier work on carbon neutrality — Apple's
      // clean energy and materials programmes are run with the people in the
      // supply chain, not around them — while the option about inviting
      // suppliers to briefings on Apple's product line-up is invented, and that
      // is the one left out. Confirmed.
      { type: "multiple", match: "אילו מהמשפטים הבאים מתארים כיצד Apple תומכת באנשים שבשרשרת ה", answers: ["Apple מציעה להם הזדמנויות להיות מנהיגים וללמוד מהמומחיות של אחרים.", "Apple מתעדפת בריאות ובטיחות בשרשרת האספקה שלה באמצעות תקנים מחמירים.", "Apple עובדת בשיתוף פעולה הדוק עם שרשרת האספקה שלה כדי להשיג את היעד שלה לניטרליות פחמנית עד 2030."] }
    ]
  },
  "התחברות-ל-mdm": {
    name: "התחברות ל-MDM",
    section: "Apple Professional Academy",
    questions: [
      {
        type: "single",
        match: "מה ניתן לעשות ב'הקצאת שרת MDM' ב-Apple Business Manager",
        answer: "לנהל את ההקצאה האוטומטית של מכשירים."
      },
      {
        type: "single",
        match: "מה עליכם להעלות לפתרון ה-MDM שלכם כדי להקצות יישומים וספרים שנרכשו ב-Apple Business Manager",
        answer: "אסימון תוכן"
      },
      { type: "single", match: "באיזו תדירות עליכם להחליף את האסימון של שרת ה-MDM", answer: "פעם בשנה." },
      { type: "single", match: "איזה סוג הרשמה יכול לרשום באופן אוטומטי מכשירים בפתרון MDM", answer: "הרשמה אוטומטית למכשיר" },
      { type: "single", match: "מהו השלב הראשון שעליכם לבצע כדי לקשר בין Apple Business Manager לפתרון ה-MDM שלכם", answer: "להוריד את המפתח הציבורי של שרת ה-MDM." },
      { type: "multiple", match: "אילו שניים מהבאים דרושים לכם כדי ליצור אישור APNs", answers: ["בקשה לחתימת אישורים (CSR) מפתרון ה-MDM", "חשבון Apple מנוהל"] }
    ]
  },
  "מידע-על-אימות-דומיין": {
    name: "מידע על אימות דומיין",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "מה תוכלו לעשות אחרי שהדומיין שלכם אומת ב-Apple Business Manager", answer: "ליצור חשבונות Apple מנוהלים בתוך הדומיין שלכם" },
      { type: "single", match: "מה משמש לאימות דומיין של ארגון", answer: "רשומות TXT של DNS" },
      { type: "single", match: "מה עושה אימות דומיין ב-Apple Business Manager", answer: "מאמת בעלות על הדומיין שלכם באמצעות Apple" },
      { type: "single", match: "כמה ימים יש לכם כדי להשלים את אימות הדומיין ב-Apple Business Manager", answer: "14 ימים" },
      { type: "single", match: "מה קורה לחשבונות Apple אישיים בדומיין המאומת", answer: "שום דבר." }
    ]
  },
  "תכנון-עבור-הארגון-שלכם": {
    name: "תכנון עבור הארגון שלכם",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "מיהו הבעלים של חשבון Apple מנוהל", answer: "הארגון שיצר אותם" },
      { type: "multiple", match: "אילו שתי הרשאות תפקידים ב-Apple Business Manager יכולות להקצות תפקידים", answers: ["מנהל/ת כח אדם", "מנהל/ת מערכת"] },
      { type: "single", match: "היכן ב-Apple Business Manager אתם מגדירים את היכולת של משתמש להשתמש בשירותי Apple", answer: "ניהול גישה" }
    ]
  },
  "יצירת-חשבונות-apple-מנוהלים": {
    name: "יצירת חשבונות Apple מנוהלים",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "איך אתם יוצרים חשבון משתמש ב-Apple Business Manager שמוקצה לו תפקיד של 'מנהל/ת מערכת'", answer: "יש ליצור את החשבון באופן ידני ולהקצות לו את התפקיד 'מנהל/ת מערכת'." },
      { type: "single", match: "משתמש שיש לו את התפקיד 'מנהל/ת רישום המכשיר' ב-Apple Business Manager", answer: "להוסיף את התפקיד 'מנהל/ת תוכן' לחשבון המשתמש." },
      { type: "multiple", match: "באילו שתי דרכים ניתן ליצור חשבון Apple מנוהל", answers: ["באופן ידני ב-Apple Business Manager", "באופן אוטומטי באמצעות איחוד עם ספק זהות (IdP)"] }
    ]
  },
  "אימות-מאוחד": {
    name: "אימות מאוחד",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "מה עליכם לעשות ב-Apple Business Manager לאחר שהוספתם את רשומת TXT", answer: "להקליק על הכפתור Check Now (בדיקה כעת) עבור הדומיין ב'העדפות' > 'חשבונות'." },
      { type: "single", match: "איזה תהליך מקשר את ה-IdP של ארגון ל-Apple Business Manager", answer: "אימות מאוחד" },
      { type: "single", match: "כשאתם מאחדים את Apple Business Manager עם Microsoft Entra ID", answer: "את האישורים של מנהל מערכת גלובלי, מנהל יישומים או חשבון מנהל מערכת של יישום ענן של Microsoft Entra ID שקיימים בדומיין" },
      { type: "single", match: "מה אתם חייבים לעשות לפני שאתם מקשרים את ספק הזהות", answer: "להשלים את תהליך אימות הדומיין." }
    ]
  },
  "שילוב-apple-business-manager-עם-directory-sync": {
    name: "שילוב Apple Business Manager עם Directory Sync",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "בעת הגדרת התצורה של Directory Sync", answer: "את האסימון שהורד מ-Apple Business Manager" },
      { type: "single", match: "במה ניתן להשתמש כדי להפוך לאוטומטי את הסנכרון של נתוני חשבון", answer: "Directory Sync" },
      { type: "single", match: "מה קורה לחשבונות משתמשים קיימים ב-Apple Business Manager אם אתם מנתקים את Directory Sync", answer: "החשבונות הופכים לחשבונות ידניים." }
    ]
  },
  "איך-זה-עובד": {
    name: "איך זה עובד",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "אילו מבין הבאים ניתן להפעיל רק במחשבי Mac ובמכשירי iPhone או iPad מנוהלים בבעלות ארגונית", answer: "פיקוח" },
      { type: "multiple", match: "אילו מהבאים הם שלושה סוגים של רישום מכשירי Apple", answers: ["רישום משתמשים מבוסס-חשבון", "רישום מכשירים מבוסס-חשבון", "רישום מכשירים אוטומטי"] },
      { type: "single", match: "על איזה מכשיר של Apple תוכלו לפקח באמצעות 'רישום מכשירים אוטומטי' או 'רישום מכשירים מבוסס-חשבון'", answer: "Mac" },
      { type: "multiple", match: "אילו סוגי מכשירים של Apple תומכים ב'רישום משתמשים מבוסס-חשבון'", answers: ["Apple Vision Pro", "Mac", "iPhone"] }
    ]
  },
  "קביעת-תצורה-של-מכשירים": {
    name: "קביעת תצורה של מכשירים",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "איזה מדריך מפרט את כל האפשרויות של מנות תוכן", answer: "פריסת פלטפורמת Apple" },
      { type: "multiple", match: "מבין המרכיבים המרכזיים הללו, ציינו שניים שבהם נעשה שימוש על ידי MDM כדי לתקשר עם מכשירים", answers: ["פקודות", "הגבלות"] },
      { type: "multiple", match: "מבין המשפטים הבאים, ציינו שלושה נכונים לגבי שיטות מומלצות לעבודה עם פרופילי תצורה", answers: ["פרופיל תצורה יחיד יכול להכיל מנות תוכן מרובות.", "יש להשתמש במנת תוכן אחת בלבד לכל פרופיל, מכיוון שניתן להתקין במכשיר יותר מפרופיל תצורה אחד.", "אם מתקינים שני פרופילי תצורה עם הגבלות סותרות, מנת התוכן המגבילה יותר תשמש עבור המכשיר."] }
    ]
  },
  "חזרה-מהירה-לשירות": {
    name: "חזרה מהירה לשירות",
    section: "Apple Professional Academy",
    questions: [
      { type: "single", match: "ישנם שלושה שלבים בתהליך של החזרת מכשירים שנפרסו בעבר לשירות", answer: "העברת הנתונים של המשתמש או הנתונים הארגוניים לארכיון." },
      { type: "multiple", match: "ישנן ארבע שיטות עיקריות להחזרת Mac להגדרות היצרן", answers: ["שורת הפקודה", "פקודה דרך MDM"] },
      { type: "single", match: "באילו מבין הבאים ניתן להשתמש כדי להכין iPhone או iPad לפריסה מחדש", answer: "הפעלת הפקודה 'מחיקת כל התוכן וההגדרות' דרך MDM." }
    ]
  },
  // Graded 20% on 2026-09-01 (content/view/461965, passes only at 100%). That
  // attempt confirmed question 4 and rejected one option on each of the other
  // four, so every answer below either survived the grade or replaces one the
  // server had already refused:
  //   1 rejected "התמקדות בלעדית בתוכניות הדרכה" — Dynamic TEI is the online
  //     calculator customers adjust with their own numbers, which is what the
  //     remaining option describes.
  //   2 rejected the set holding "TCO גבוהה יותר": a higher total cost of
  //     ownership is the opposite of what Cisco reported, so the three benefits
  //     are the other three options.
  //   3 rejected "חסות ניהולית" — that is the employee-choice programme, a
  //     later step than awareness; showing the machine to the next team is the
  //     awareness step.
  //   5 rejected the set holding "מרוצים מהמכשירים שיש לכם כרגע": that asks
  //     about today's devices rather than a concern about Mac, and the other
  //     three ask about deployment time, total cost and the IT support ratio.
  "בוחן-בניית-מומחיות-ב-mac": {
    name: "בוחן – בניית מומחיות ב-Mac",
    questions: [
      { type: "single", match: "כיצד מצליח מנוע Dynamic TEI של Forrester Consulting לשפר", answer: "באמצעות האפשרות שניתנת ללקוחות להציג ולהתאים אישית נתוני TEI" },
      { type: "multiple", match: "אילו תועלות נרשמו ב-Cisco", answers: ["פרודוקטיביות מוגברת בקרב אנשי מכירות", "פחות בעיות חומרה בקרב משתמשי Mac", "צורך מופחת בתמיכה ממערך ה-IT"] },
      { type: "single", match: "כיצד תוכלו לסייע בהגברת המודעות של לקוחות ל-MacBook Air", answer: "הציגו את MacBook Air לצוות הבא שתפגשו." },
      { type: "single", match: "מהו הצעד הראשון בשכנוע של לקוחות לאמץ את MacBook Air", answer: "אפיון הלקוח/ה" },
      { type: "multiple", match: "אילו שאלות תוכלו להציג כדי להבין טוב יותר את החששות של הלקוחות", answers: ["כמה זמן לוקח לפרוס את המחשבים לעובדים?", "האם השווית את עלות הבעלות הכוללת של Mac לזו של מחשבים אחרים?", "בכמה מחשבי Windows יכול חבר אחד בצוות ה-IT לתמוך כיום?"] }
    ]
  },
  // Two of Apple Business Manager's own group types. The grade rejected "Device
  // Group", "Dynamic User Group" and "Managed Group" one after another, each
  // with "לא נכון. לא ניתן ליצור קבוצה מסוג זה", and confirmed both of the
  // pair below — which is the one combination six attempts never tried.
  "התמצאות-ב-apple-business-manager": {
    name: "התמצאות ב-Apple Business Manager",
    questions: [
      { type: "multiple", match: "אילו מבין הבאים הם שני סוגים של קבוצות שניתן ליצור", answers: ["Smart User Group (קבוצת משתמשים חכמים)", "User Group (קבוצת משתמשים)"] }
    ]
  },
  // Device Enrolment is what hands a purchased device to an MDM server on its
  // own. The grade ruled out both of the alternatives that had it e-mailing a
  // link to users and pushing serial numbers to MDM, and of the two answers
  // left, the other one describes devices that were set up first — which is the
  // manual route, not what enrolment does.
  "רישום-הארגון": {
    name: "רישום הארגון",
    questions: [
      { type: "single", match: "מה הוא בעצם עושה", answer: "הוא מאפשר הקצאה אוטומטית של מכשירים שנרכשו לשרת MDM" }
    ]
  },
};

// Two questions are the same question when one of their stored match texts is a
// prefix of the other: a match is only the opening of the question, and the
// runner records a slightly different length from the one a person typed.
function sameQuestion(one, other) {
  const tidy = (value = "") => String(value).normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase();
  const a = tidy(one);
  const b = tidy(other);
  if (!a || !b) return false;
  const overlap = Math.min(a.length, b.length);
  return overlap >= 20 && (a.startsWith(b) || b.startsWith(a));
}

// An exam the run learned about belongs to the entry it was identified as, when
// it was identified at all; otherwise to whichever authored entry it shares a
// question with. Only if it matches nothing is it a new exam.
function hostFor(authoredExams, learned, id) {
  if (learned.examId && authoredExams[learned.examId]) return learned.examId;
  if (authoredExams[id]) return id;
  for (const [candidateId, exam] of Object.entries(authoredExams)) {
    const shared = exam.questions.some((question) =>
      learned.questions.some((mine) => sameQuestion(question.match, mine.match)));
    if (shared) return candidateId;
  }
  return null;
}

// A confirmed answer replaces the stored one for that question — that is the
// whole point, since a stored answer the server has rejected is worse than none
// — and a question nobody had written down yet is appended.
export const exams = (() => {
  const merged = { ...authored };
  for (const [id, learned] of Object.entries(learnedExams)) {
    if (!learned?.questions?.length) continue;
    const host = hostFor(authored, learned, id);
    if (!host) {
      merged[id] = { name: learned.name || id, section: learned.section, questions: learned.questions };
      continue;
    }
    const questions = [...merged[host].questions];
    for (const question of learned.questions) {
      const at = questions.findIndex((candidate) => sameQuestion(candidate.match, question.match));
      if (at >= 0) questions[at] = question;
      else questions.push(question);
    }
    merged[host] = { ...merged[host], questions };
  }
  return merged;
})();
