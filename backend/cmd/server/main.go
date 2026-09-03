package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"everest-backend/internal/ai"
	"everest-backend/internal/auth"
	"everest-backend/internal/comment"
	"everest-backend/internal/config"
	"everest-backend/internal/database"
	"everest-backend/internal/editmediapost"
	"everest-backend/internal/edittextpost"
	"everest-backend/internal/follow"
	"everest-backend/internal/post"
	"everest-backend/internal/postdelete"
	"everest-backend/internal/profileconnections"
	"everest-backend/internal/profilemedia"
	"everest-backend/internal/profileview"
	"everest-backend/internal/reaction"
	"everest-backend/internal/reels"
	"everest-backend/internal/search"
	"everest-backend/internal/textpost"
	"everest-backend/internal/user"
	"everest-backend/internal/verifiedbadge"
)

const (
	serverReadTimeout       = 15 * time.Second
	serverWriteTimeout      = 90 * time.Second
	serverIdleTimeout       = 120 * time.Second
	serverReadHeaderTimeout = 10 * time.Second

	startupTimeout = 20 * time.Second
)

func main() {
	cfg := config.LoadConfig()

	db := database.ConnectMongoDB(
		cfg.MongoURI,
		cfg.DBName,
	)

	startupCtx, cancelStartup := context.WithTimeout(
		context.Background(),
		startupTimeout,
	)
	defer cancelStartup()

	authService := auth.NewAuthService(
		db.Database,
		cfg.GoogleClientID,
	)

	authHandler := auth.NewAuthHandler(
		authService,
		cfg.JWTSecret,
	)

	userService := user.NewUserService(
		db.Database,
	)

	userHandler := user.NewUserHandler(
		userService,
	)

	if err := userService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"User indexes warning:",
			err,
		)
	}

	searchService := search.NewService(
		db.Database,
	)

	searchHandler := search.NewHandler(
		searchService,
	)

	if err := searchService.CreateIndexes(
		startupCtx,
	); err != nil {
		log.Println(
			"User search indexes warning:",
			err,
		)
	}

	aiService, err := ai.NewAIService(
		db.Database,
		cfg.GeminiAPIKey,
		cfg.GeminiModel,
	)
	if err != nil {
		log.Fatal(
			"AI service failed:",
			err,
		)
	}

	aiHandler := ai.NewAIHandler(
		aiService,
	)

	if err := aiService.CreateIndexes(
		startupCtx,
	); err != nil {
		log.Println(
			"AI indexes warning:",
			err,
		)
	}

	postService, err := post.NewPostService(
		db.Database,
		cfg,
	)
	if err != nil {
		log.Fatal(
			"Post service failed:",
			err,
		)
	}

	postHandler := post.NewPostHandler(
		postService,
	)

	if err := postService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"Post indexes warning:",
			err,
		)
	}

	reelsService := reels.NewReelsService(
		db.Database,
	)

	reelsHandler := reels.NewReelsHandler(
		reelsService,
	)

	if err := reelsService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"Reels indexes warning:",
			err,
		)
	}

	postEditService, err := editmediapost.NewPostEditService(
		db.Database,
		cfg,
	)
	if err != nil {
		log.Fatal(
			"Edit media post service failed:",
			err,
		)
	}

	postEditHandler := editmediapost.NewPostEditHandler(
		postEditService,
	)

	textPostService := textpost.NewTextPostService(
		db.Database,
	)

	textPostHandler := textpost.NewTextPostHandler(
		textPostService,
	)

	if err := textPostService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"Text post indexes warning:",
			err,
		)
	}

	textPostEditService, err := edittextpost.NewTextPostEditService(
		db.Database,
	)
	if err != nil {
		log.Fatal(
			"Text post edit service failed:",
			err,
		)
	}

	textPostEditHandler := edittextpost.NewTextPostEditHandler(
		textPostEditService,
	)

	reactionService := reaction.NewReactionService(
		db.Database,
	)

	reactionHandler := reaction.NewReactionHandler(
		reactionService,
	)

	if err := reactionService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"Reaction indexes warning:",
			err,
		)
	}

	commentService := comment.NewCommentService(
		db.Database,
	)

	commentHandler := comment.NewCommentHandler(
		commentService,
	)

	if err := commentService.CreateIndexes(startupCtx); err != nil {
		log.Println(
			"Comment indexes warning:",
			err,
		)
	}

	postDeleteService, err := postdelete.NewPostDeleteService(
		db.Database,
		cfg,
	)
	if err != nil {
		log.Fatal(
			"Post delete service failed:",
			err,
		)
	}

	postDeleteHandler := postdelete.NewPostDeleteHandler(
		postDeleteService,
	)

	profileMediaService, err := profilemedia.NewProfileMediaService(
		db.Database,
		cfg,
	)
	if err != nil {
		log.Fatal(
			"Profile media service failed:",
			err,
		)
	}

	profileMediaHandler := profilemedia.NewProfileMediaHandler(
		profileMediaService,
	)

	profileViewService := profileview.NewService(
		db.Database,
	)

	profileConnectionsService :=
		profileconnections.NewService(
			db.Database,
		)

	profileConnectionsHandler :=
		profileconnections.NewHandler(
			profileConnectionsService,
		)

	profileViewHandler := profileview.NewHandler(
		profileViewService,
	)

	if err := profileViewService.CreateIndexes(
		startupCtx,
	); err != nil {
		log.Println(
			"Profile view indexes warning:",
			err,
		)
	}

	followService := follow.NewService(
		db.Database,
	)

	followHandler := follow.NewHandler(
		followService,
	)

	if err := followService.CreateIndexes(
		startupCtx,
	); err != nil {
		log.Println(
			"Follow indexes warning:",
			err,
		)
	}

	verifiedBadgeService :=
		verifiedbadge.NewService(
			db.Database,
		)

	verifiedBadgeHandler :=
		verifiedbadge.NewHandler(
			verifiedBadgeService,
		)

	if err := verifiedBadgeService.CreateIndexes(
		startupCtx,
	); err != nil {
		log.Println(
			"Verified badge indexes warning:",
			err,
		)
	}

	mux := http.NewServeMux()

	registerHealthRoute(mux)

	auth.RegisterAuthRoutes(
		mux,
		authHandler,
		userHandler,
		cfg.JWTSecret,
	)

	verifiedbadge.RegisterRoutes(
		mux,
		verifiedBadgeHandler,
		cfg.JWTSecret,
	)

	follow.RegisterRoutes(
		mux,
		followHandler,
		cfg.JWTSecret,
	)

	profileview.RegisterRoutes(
		mux,
		profileViewHandler,
		cfg.JWTSecret,
	)

	profileconnections.RegisterRoutes(
		mux,
		profileConnectionsHandler,
		cfg.JWTSecret,
	)

	search.RegisterRoutes(
		mux,
		searchHandler,
		cfg.JWTSecret,
	)

	ai.RegisterAIRoutes(
		mux,
		aiHandler,
		cfg.JWTSecret,
	)

	profilemedia.RegisterProfileMediaRoutes(
		mux,
		profileMediaHandler,
		cfg.JWTSecret,
	)

	post.RegisterPostRoutes(
		mux,
		postHandler,
		cfg.JWTSecret,
	)

	reels.RegisterReelsRoutes(
		mux,
		reelsHandler,
		cfg.JWTSecret,
	)

	editmediapost.RegisterPostEditRoutes(
		mux,
		postEditHandler,
		cfg.JWTSecret,
	)

	postdelete.RegisterPostDeleteRoutes(
		mux,
		postDeleteHandler,
		cfg.JWTSecret,
	)

	textpost.RegisterTextPostRoutes(
		mux,
		textPostHandler,
		cfg.JWTSecret,
	)

	edittextpost.RegisterTextPostEditRoutes(
		mux,
		textPostEditHandler,
		cfg.JWTSecret,
	)

	reaction.RegisterReactionRoutes(
		mux,
		reactionHandler,
		cfg.JWTSecret,
	)

	comment.RegisterCommentRoutes(
		mux,
		commentHandler,
		cfg.JWTSecret,
	)

	server := &http.Server{
		Addr: ":" + cfg.Port,

		Handler: securityMiddleware(
			corsMiddleware(mux),
		),

		ReadTimeout:       serverReadTimeout,
		ReadHeaderTimeout: serverReadHeaderTimeout,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       serverIdleTimeout,
	}

	log.Println(
		"Everest backend running on port",
		cfg.Port,
	)

	if err := server.ListenAndServe(); err != nil &&
		err != http.ErrServerClosed {
		log.Fatal(
			"Server failed:",
			err,
		)
	}
}

func registerHealthRoute(
	mux *http.ServeMux,
) {
	mux.HandleFunc(
		"/health",
		func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			if r.Method != http.MethodGet {
				w.Header().Set(
					"Allow",
					http.MethodGet,
				)

				http.Error(
					w,
					"Method not allowed",
					http.StatusMethodNotAllowed,
				)

				return
			}

			w.Header().Set(
				"Content-Type",
				"text/plain; charset=utf-8",
			)

			w.Header().Set(
				"Cache-Control",
				"no-store",
			)

			w.WriteHeader(
				http.StatusOK,
			)

			if _, err := w.Write(
				[]byte(
					"Everest backend is running",
				),
			); err != nil {
				log.Println(
					"Health response write warning:",
					err,
				)
			}
		},
	)
}

func corsMiddleware(
	next http.Handler,
) http.Handler {
	allowedOrigins := map[string]bool{
		"http://localhost:5173": true,
		"http://localhost:5174": true,
		"http://localhost:3000": true,
		"http://127.0.0.1:5173": true,
		"http://127.0.0.1:5174": true,
		"http://127.0.0.1:3000": true,
	}

	return http.HandlerFunc(
		func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			origin := r.Header.Get(
				"Origin",
			)

			if allowedOrigins[origin] {
				w.Header().Set(
					"Access-Control-Allow-Origin",
					origin,
				)

				w.Header().Set(
					"Access-Control-Allow-Credentials",
					"true",
				)
			}

			w.Header().Set(
				"Vary",
				"Origin",
			)

			w.Header().Set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, PATCH, DELETE, OPTIONS",
			)

			w.Header().Set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With, Accept, Cache-Control, Pragma",
			)

			w.Header().Set(
				"Access-Control-Max-Age",
				"600",
			)

			if r.Method == http.MethodOptions {
				w.WriteHeader(
					http.StatusOK,
				)
				return
			}

			next.ServeHTTP(
				w,
				r,
			)
		},
	)
}

func securityMiddleware(
	next http.Handler,
) http.Handler {
	return http.HandlerFunc(
		func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			w.Header().Set(
				"X-Content-Type-Options",
				"nosniff",
			)

			w.Header().Set(
				"X-Frame-Options",
				"DENY",
			)

			w.Header().Set(
				"Referrer-Policy",
				"strict-origin-when-cross-origin",
			)

			if r.URL.Path == "/health" {
				next.ServeHTTP(
					w,
					r,
				)
				return
			}

			if len(r.URL.Path) >= 5 &&
				r.URL.Path[:5] == "/api/" {
				w.Header().Set(
					"Cache-Control",
					"no-store, no-cache, must-revalidate, proxy-revalidate",
				)

				w.Header().Set(
					"Pragma",
					"no-cache",
				)

				w.Header().Set(
					"Expires",
					"0",
				)

				w.Header().Set(
					"Surrogate-Control",
					"no-store",
				)
			}

			next.ServeHTTP(
				w,
				r,
			)
		},
	)
}
