pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                script {
                    // App stack only — avoid building jenkins/ngrok (CI runs inside Jenkins; 8081 already in use)
                    if (isUnix()) {
                        sh 'docker compose build db app frontend'
                    } else {
                        bat 'docker compose build db app frontend'
                    }
                }
            }
        }

        // pytest בתוך app-test מול Postgres (profile ci) — פרויקט compose נפרד כדי לא לסגור את הסטאק הראשי.
        stage('Test') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            set -e
                            if [ ! -f .env ]; then
                              if [ -f .env.example ]; then
                                cp .env.example .env
                                echo "Created .env from .env.example (not in Git)."
                              else
                                echo "ERROR: .env missing and no .env.example to copy." >&2
                                exit 1
                              fi
                            fi
                            mkdir -p backend/test-results
                            export POSTGRES_HOST_PORT=15432
                            docker compose -p notes-api-ci --profile ci build db app-test
                            docker compose -p notes-api-ci --profile ci up -d db
                            docker compose -p notes-api-ci --profile ci run --rm \
                              -v "${WORKSPACE}/backend/test-results:/report" \
                              app-test \
                              sh -c 'pytest tests -v --tb=short --junitxml=/report/junit.xml'
                            docker compose -p notes-api-ci --profile ci down -v
                        '''
                    } else {
                        bat '''
                            if not exist .env (
                              if exist .env.example (
                                copy /Y .env.example .env
                                echo Created .env from .env.example
                              ) else (
                                echo ERROR: .env missing and no .env.example
                                exit /b 1
                              )
                            )
                            if not exist backend\\test-results mkdir backend\\test-results
                            set POSTGRES_HOST_PORT=15432
                            docker compose -p notes-api-ci --profile ci build db app-test
                            docker compose -p notes-api-ci --profile ci up -d db
                            docker compose -p notes-api-ci --profile ci run --rm -v "%WORKSPACE%\\backend\\test-results:/report" app-test sh -c "pytest tests -v --tb=short --junitxml=/report/junit.xml"
                            docker compose -p notes-api-ci --profile ci down -v
                        '''
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            if [ ! -f .env ]; then
                              if [ -f .env.example ]; then
                                cp .env.example .env
                                echo "Created .env from .env.example (not in Git)."
                              else
                                echo "ERROR: .env missing and no .env.example to copy." >&2
                                exit 1
                              fi
                            fi
                            # Kill any container holding our ports (regardless of name/project)
                            for port in 5432 8000 9080; do
                              cid=$(docker ps -q --filter "publish=${port}")
                              if [ -n "$cid" ]; then
                                echo "Removing container on port ${port}: $cid"
                                docker rm -f "$cid" || true
                              fi
                            done
                            docker compose up -d --remove-orphans db app frontend
                        '''
                    } else {
                        bat '''
                            if not exist .env (
                              if exist .env.example (
                                copy /Y .env.example .env
                                echo Created .env from .env.example
                              ) else (
                                echo ERROR: .env missing and no .env.example
                                exit /b 1
                              )
                            )
                            docker compose stop db app frontend 2>nul & docker compose rm -f db app frontend 2>nul & docker compose up -d --remove-orphans db app frontend
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'הפייפליין הושלם בהצלחה: Checkout, Build, Test (pytest) ו-Deploy (db, app, frontend בלבד — ללא jenkins/ngrok).'
        }
        failure {
            echo 'הפייפליין נכשל. בדוק את לוגי השלבים (Checkout / Build / Test / Deploy) ואת זמינות Docker וקובץ .env לפי הצורך.'
        }
        always {
            junit allowEmptyResults: true, testResults: 'backend/test-results/junit.xml'
        }
    }
}
