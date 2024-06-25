ecr_login_prod:
	aws ecr get-login-password --region us-east-1 --profile farmgirl-prod | docker login --username AWS --password-stdin 536448734625.dkr.ecr.us-east-1.amazonaws.com/fgf-cms

docker_push_prod: ecr_login_prod
	docker build --target production --platform linux/amd64 -t 536448734625.dkr.ecr.us-east-1.amazonaws.com/fgf-cms:latest .
	docker push 536448734625.dkr.ecr.us-east-1.amazonaws.com/fgf-cms:latest

# Force ECS deployment
deploy_prod:
	aws ecs update-service --cluster fgf-cms-cluster --service web-app --force-new-deployment --profile farmgirl-prod
